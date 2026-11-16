package com.augustine.nasa_space_app_backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** No simulator/baseline defaults. Candidate radiation rates never assert training compatibility. */
@Component
public class MlObservationInputs {
 private final JdbcTemplate jdbc;
 private final long maxAge,maxSkew;
 public MlObservationInputs(JdbcTemplate jdbc,@Value("${astrohealth.ml.max-age-seconds:86400}") long maxAge,
                            @Value("${astrohealth.ml.max-skew-seconds:21600}") long maxSkew) {
  if(maxAge<1 || maxAge>31536000 || maxSkew<0 || maxSkew>31536000)throw new IllegalArgumentException("Invalid ML freshness policy");
  this.jdbc=jdbc;this.maxAge=maxAge;this.maxSkew=maxSkew;
 }
 public record Prepared(Map<String,Object> snapshot,List<UUID> observationIds,boolean synthetic,String outcome) { }
 public Prepared collect(UUID astronaut,Instant cutoff,List<UUID> requested) {
  List<Map<String,Object>> selected;
  if(requested!=null && !requested.isEmpty()) {
   if(new HashSet<>(requested).size()!=requested.size() || requested.size()>100) throw new MlProblem(400,"INVALID_OBSERVATION_SELECTION");
   selected=new ArrayList<>();
   for(UUID id:requested) {
    var rows=jdbc.queryForList(query()+" AND o.id=?",astronaut,Timestamp.from(cutoff),id);
    if(rows.isEmpty())throw new MlProblem(404,"OBSERVATION_NOT_AVAILABLE");
    selected.add(rows.get(0));
   }
  } else {
   // Bounded recent history: ambiguity is reported, not resolved by blending incompatible scopes.
   selected=jdbc.queryForList(query()+" ORDER BY o.measured_at DESC,o.id LIMIT 100",astronaut,Timestamp.from(cutoff));
  }
  List<Map<String,Object>> evidence=new ArrayList<>();List<UUID> ids=new ArrayList<>();
  Set<String> present=new HashSet<>();List<String> issues=new ArrayList<>();boolean synthetic=false;
  Instant earliest=null,latest=null;
  for(var row:selected) {
   UUID id=(UUID)row.get("id");ids.add(id);
   String indicator=(String)row.get("indicator_code");present.add(indicator);
   Instant measured=((Timestamp)row.get("measured_at")).toInstant();
   if(measured.isBefore(cutoff.minusSeconds(maxAge)))issues.add("STALE_OBSERVATION:"+id);
   if(earliest==null || measured.isBefore(earliest))earliest=measured;
   if(latest==null || measured.isAfter(latest))latest=measured;
   boolean itemSynthetic=Boolean.TRUE.equals(row.get("is_synthetic"));synthetic|=itemSynthetic;
   Map<String,Object> item=new LinkedHashMap<>();
   item.put("observationId",id);item.put("indicator",indicator);item.put("measuredAt",measured.toString());
   item.put("comparisonScopeId",row.get("comparison_scope_id"));item.put("activityContext",row.get("activity_context"));
   item.put("sourceKind",row.get("source_kind"));item.put("synthetic",itemSynthetic);
   item.put("measurements",values(id,(String)row.get("storage_kind")));
   evidence.add(item);
  }
  for(String indicator:List.of("heart_rate","blood_pressure","blood_sugar","body_temperature","sleep_hours","mood","muscle","bone_mineral_density","cumulative_absorbed_radiation_dose"))
   if(!present.contains(indicator))issues.add("MISSING_INDICATOR:"+indicator);
  if(earliest!=null && Duration.between(earliest,latest).getSeconds()>maxSkew)issues.add("ASYNCHRONOUS_MEASUREMENTS");
  for(var group:selected.stream().collect(java.util.stream.Collectors.groupingBy(r->r.get("indicator_code"))).entrySet())
   if(group.getValue().stream().map(r->r.get("comparison_scope_id").toString()+":"+r.get("activity_context")).distinct().count()>1)issues.add("AMBIGUOUS_SCOPE_OR_CONTEXT:"+group.getKey());
  List<Map<String,Object>> rates=new ArrayList<>();
  var radiation=selected.stream().filter(r->r.get("indicator_code").equals("cumulative_absorbed_radiation_dose"))
   .sorted(Comparator.comparing(r->((Timestamp)r.get("measured_at")).toInstant())).toList();
  for(int i=1;i<radiation.size();i++) {
   var a=radiation.get(i-1);var b=radiation.get(i);
   var av=jdbc.queryForObject("SELECT value FROM health_measurements WHERE observation_id=?",BigDecimal.class,a.get("id"));
   var bv=jdbc.queryForObject("SELECT value FROM health_measurements WHERE observation_id=?",BigDecimal.class,b.get("id"));
   try {
    double rate=radiationRate(av,bv,((Timestamp)a.get("measured_at")).toInstant(),((Timestamp)b.get("measured_at")).toInstant(),a.get("comparison_scope_id"),b.get("comparison_scope_id"));
    rates.add(Map.of("fromObservationId",a.get("id"),"toObservationId",b.get("id"),"averageAbsorbedDoseRateMgyPerDay",rate,
      "intervalSeconds",Duration.between(((Timestamp)a.get("measured_at")).toInstant(),((Timestamp)b.get("measured_at")).toInstant()).toSeconds(),"trainingWindowCompatible",false));
   } catch(IllegalArgumentException invalid) {issues.add("INVALID_RADIATION_INTERVAL");}
  }
  boolean insufficient=issues.stream().anyMatch(s->s.startsWith("MISSING_") || s.startsWith("STALE_") || s.startsWith("ASYNCHRONOUS"));
  issues.addAll(List.of("GRIP_KGF_TO_MODEL_KG_PROTOCOL_UNCONFIRMED","AREAL_BONE_DENSITY_IS_NOT_T_SCORE",
    "RADIATION_TRAINING_DAILY_WINDOW_UNCONFIRMED","GLUCOSE_TRAINING_UNIT_UNCONFIRMED","MOOD_SCALE_TRAINING_SEMANTICS_UNCONFIRMED","TRAINING_FEATURE_RANGES_UNAVAILABLE"));
  Map<String,Object> snapshot=new LinkedHashMap<>();snapshot.put("mode","OBSERVATIONS");snapshot.put("cutoff",cutoff.toString());
  snapshot.put("evidence",evidence);snapshot.put("issues",issues);snapshot.put("candidateRadiationRates",rates);
  snapshot.put("freshnessPolicy",Map.of("maxAgeSeconds",maxAge,"maxSkewSeconds",maxSkew,"purpose","TRANSPORT_ALIGNMENT_NOT_CLINICAL_CADENCE"));
  snapshot.put("expectedArtifactSha256",AresModelContract.HASHES);
  return new Prepared(snapshot,ids,synthetic,insufficient?"INSUFFICIENT_DATA":"INCOMPATIBLE_FEATURES");
 }
 private String query() {
  return "SELECT o.id,o.indicator_code,o.storage_kind,o.comparison_scope_id,o.activity_context,o.measured_at,o.source_kind,"
   +"(o.source_kind='SIMULATION' OR o.simulation_metadata IS NOT NULL OR o.provenance::text ~* '(synthetic|simulation)' OR o.source_name ~* '(synthetic|simulation)' "
   +"OR EXISTS(SELECT 1 FROM astronaut_checkins c WHERE c.id=o.checkin_id AND c.is_simulated)) AS is_synthetic "
   +"FROM health_observations o WHERE o.astronaut_id=? AND o.measured_at<=? AND NOT EXISTS(SELECT 1 FROM health_observations n WHERE n.supersedes_observation_id=o.id)";
 }
 private List<Map<String,Object>> values(UUID id,String kind) {
  // Explicit table/column allowlist; no arbitrary source provenance is returned to clients.
  String query=switch(kind) {
   case "SCALAR"->"SELECT metric_code,value,unit FROM health_measurements WHERE observation_id=?";
   case "BLOOD_PRESSURE"->"SELECT systolic,diastolic,unit FROM blood_pressure_observations WHERE observation_id=?";
   case "SLEEP"->"SELECT asleep_seconds,asleep_seconds::numeric/3600 AS duration_hours FROM sleep_sessions WHERE observation_id=?";
   case "MOOD"->"SELECT score,unit FROM mood_assessments WHERE observation_id=?";
   case "MUSCLE"->"SELECT grip_strength_kgf,muscle_mass_kg FROM muscle_assessments WHERE observation_id=?";
   case "BONE"->"SELECT areal_density,unit FROM bone_density_examinations WHERE observation_id=?";
   default->throw new MlProblem(400,"UNSUPPORTED_OBSERVATION");
  };
  return jdbc.queryForList(query,id);
 }
 public static double radiationRate(BigDecimal earlier,BigDecimal later,Instant from,Instant to,Object firstScope,Object secondScope) {
  if(earlier==null || later==null || from==null || to==null || firstScope==null || !firstScope.equals(secondScope)
    || earlier.signum()<0 || later.compareTo(earlier)<0 || !to.isAfter(from)) throw new IllegalArgumentException("Incompatible cumulative radiation observations");
  double seconds=Duration.between(from,to).toNanos()/1_000_000_000.0;
  double result=later.subtract(earlier).doubleValue()*86400.0/seconds;
  if(!Double.isFinite(result))throw new IllegalArgumentException("Invalid radiation rate");return result;
 }
}
