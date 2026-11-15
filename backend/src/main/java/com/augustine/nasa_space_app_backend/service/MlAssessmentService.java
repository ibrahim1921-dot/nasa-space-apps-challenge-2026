package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.MlAssessmentDtos.*;
import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.dto.KnowledgeResponses.Countermeasure;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.*;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
public class MlAssessmentService {
 private final JdbcTemplate jdbc;private final ObjectMapper json;private final AuthService auth;
 private final MlObservationInputs observations;private final MlInferenceClient inference;private final KnowledgeService knowledge;
 private final boolean enabled,syntheticEnabled;
 private static final String DISCLAIMER="Experimental nonclinical model output, not a diagnosis, authorized treatment or NASA-approved risk classification. Blueprint class labels and training units remain unverified. Educational countermeasures do not authorize changes to medication, exercise, sleep schedules or mission operations. Monitoring-rule alerts are independent.";
 public MlAssessmentService(JdbcTemplate jdbc,ObjectMapper json,AuthService auth,MlObservationInputs observations,
   MlInferenceClient inference,KnowledgeService knowledge,@Value("${astrohealth.ml.enabled:false}") boolean enabled,
   @Value("${astrohealth.ml.synthetic-vectors-enabled:false}") boolean syntheticEnabled,
   @Value("${astrohealth.environment:disabled}") String environment) {
  this.jdbc=jdbc;this.json=json;this.auth=auth;this.observations=observations;this.inference=inference;this.knowledge=knowledge;
  this.enabled=enabled;this.syntheticEnabled=syntheticEnabled && Set.of("development","demo").contains(environment);
 }
 private AccountIdentity identity() {
  var a=SecurityContextHolder.getContext().getAuthentication();
  if(a==null || !a.isAuthenticated() || !(a.getPrincipal() instanceof AccountPrincipal p)) throw new AuthenticationCredentialsNotFoundException("Authentication required.");
  return auth.currentIdentity(p.accountId());
 }
 private void access(AccountIdentity actor,UUID astronaut) {
  if(actor.role()!=AccountRole.NASA_OFFICER && (actor.profile()==null || !actor.profile().astronautId().equals(astronaut))) throw new MlProblem(404,"ASSESSMENT_NOT_FOUND");
  if(jdbc.queryForObject("SELECT count(*) FROM astronauts WHERE id=?",Integer.class,astronaut)==0)throw new MlProblem(404,"ASSESSMENT_NOT_FOUND");
 }
 @Transactional
 public Detail request(UUID astronaut,Request request) {
  var actor=identity();access(actor,astronaut);
  if(actor.role()!=AccountRole.NASA_OFFICER)throw new MlProblem(403,"OFFICER_ACCESS_REQUIRED");
  if(!enabled)throw new MlProblem(503,"ML_ASSESSMENTS_DISABLED");
  Instant now=jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();
  if(request==null || request.requestKey()==null || request.requestKey().equals(new UUID(0,0)) || request.cutoff()==null
    || request.cutoff().isAfter(now) || request.cutoff().isBefore(Instant.parse("1900-01-01T00:00:00Z")) || request.cutoff().getNano()%1000!=0
    || request.inputMode()==null || !Set.of("OBSERVATIONS","EXPLICIT_SYNTHETIC_VECTOR").contains(request.inputMode()))throw new MlProblem(400,"INVALID_ASSESSMENT_REQUEST");
  if(jdbc.queryForObject("SELECT archived_at IS NOT NULL FROM astronauts WHERE id=?",Boolean.class,astronaut))throw new MlProblem(409,"ASTRONAUT_ARCHIVED");
  boolean vector=request.inputMode().equals("EXPLICIT_SYNTHETIC_VECTOR");
  Map<String,Double> features=null;
  if(vector) {
   if(!syntheticEnabled)throw new MlProblem(403,"SYNTHETIC_VECTORS_DISABLED");
   if(!Boolean.TRUE.equals(request.synthetic()) || !"BLUEPRINT_NATIVE_UNVERIFIED".equals(request.unitSystem())
    || (request.observationIds()!=null && !request.observationIds().isEmpty())) throw new MlProblem(400,"INVALID_SYNTHETIC_VECTOR");
   features=AresModelContract.validate(request.features());
  } else if(request.features()!=null || request.unitSystem()!=null || request.synthetic()!=null)throw new MlProblem(400,"INVALID_OBSERVATION_REQUEST");
  String digest=digest(request,astronaut,actor.accountId());
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,37))",Object.class,astronaut+":"+request.requestKey());
  var prior=jdbc.queryForList("SELECT assessment_id,request_sha256 FROM ml_assessment_requests WHERE astronaut_id=? AND request_key=?",astronaut,request.requestKey());
  if(!prior.isEmpty()) {
   if(!digest.equals(prior.get(0).get("request_sha256")))throw new MlProblem(409,"IDEMPOTENCY_CONFLICT");
   return detailRow((UUID)prior.get(0).get("assessment_id"));
  }
  MlObservationInputs.Prepared prepared;
  if(vector) {
   Map<String,Object> snapshot=new LinkedHashMap<>();snapshot.put("mode",request.inputMode());snapshot.put("features",features);
   snapshot.put("unitSystem",request.unitSystem());snapshot.put("issues",List.of("NUMERICAL_TEST_ONLY","TRAINING_UNITS_AND_RANGES_UNVERIFIED","TRAINING_CLASS_SEMANTICS_UNVERIFIED"));
   snapshot.put("expectedArtifactSha256",AresModelContract.HASHES);snapshot.put("origin","EXPLICIT_OFFICER_SUPPLIED_SYNTHETIC_VECTOR");
   prepared=new MlObservationInputs.Prepared(snapshot,List.of(),true,"PENDING");
  } else prepared=observations.collect(astronaut,request.cutoff(),request.observationIds());
  Map<String,Object> provenance=new LinkedHashMap<>(prepared.snapshot());provenance.put("synthetic",prepared.synthetic());
  provenance.put("requestedByAccountId",actor.accountId());provenance.put("requestKey",request.requestKey());provenance.put("nonclinical",true);
  JsonNode result=null;String failure=vector?null:prepared.outcome();
  if(vector) {
   try {
    result=inference.assess(features);
    // Persist only explicit context links, never numeric blueprint treatment triggers.
    var extended=(tools.jackson.databind.node.ObjectNode)result.deepCopy();
    extended.set("finding_codes",json.valueToTree(AresModelContract.CONTEXT_FINDINGS));
    extended.put("educational_mapping_version","astrohealth.ares.context.v1");result=extended;
   } catch(MlProblem e) {failure=Set.of("INVALID_MODEL_RESPONSE","MODEL_SERVICE_UNAVAILABLE").contains(e.getMessage())?e.getMessage():"MODEL_SERVICE_UNAVAILABLE";}
  }
  Instant completed=jdbc.queryForObject("SELECT clock_timestamp()",Timestamp.class).toInstant();
  UUID id=jdbc.queryForObject("INSERT INTO ml_health_assessments(astronaut_id,assessment_trigger,model_identifier,model_version,input_data_cutoff_at,requested_at,started_at,completed_at,status,result_schema_version,result,error_message,input_provenance) "
   +"VALUES (?,'SCHEDULED',?,?,?,?,?,?,?, ?,?::jsonb,?,?::jsonb) RETURNING id",UUID.class,
   astronaut,AresModelContract.ID,AresModelContract.VERSION,Timestamp.from(request.cutoff()),Timestamp.from(now),Timestamp.from(now),Timestamp.from(completed),
   failure==null?"SUCCEEDED":"FAILED",failure==null?"astrohealth.ares.result.v1":null,result==null?null:json.writeValueAsString(result),failure,json.writeValueAsString(provenance));
  jdbc.update("INSERT INTO ml_assessment_requests(assessment_id,astronaut_id,requested_by_account_id,request_key,request_sha256,input_mode,is_synthetic) VALUES (?,?,?,?,?,?,?)",
   id,astronaut,actor.accountId(),request.requestKey(),digest,request.inputMode(),prepared.synthetic());
  for(UUID observation:prepared.observationIds())jdbc.update("INSERT INTO ml_assessment_observations(assessment_id,astronaut_id,observation_id) VALUES (?,?,?)",id,astronaut,observation);
  return detailRow(id);
 }
 private String digest(Request r,UUID astronaut,UUID actor) {
  try {
   var canonical=new TreeMap<String,Object>();canonical.put("astronaut",astronaut);canonical.put("actor",actor);canonical.put("cutoff",r.cutoff().toString());
   canonical.put("inputMode",r.inputMode());canonical.put("unitSystem",r.unitSystem());canonical.put("synthetic",r.synthetic());
   canonical.put("features",r.features()==null?null:new TreeMap<>(r.features()));
   canonical.put("observations",r.observationIds()==null?List.of():r.observationIds().stream().sorted().toList());
   return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(canonical)));
  } catch(Exception e) {throw new MlProblem(400,"INVALID_ASSESSMENT_REQUEST");}
 }
 @Transactional(readOnly=true)
 public Detail detail(UUID id) {
  var actor=identity();var rows=jdbc.queryForList("SELECT astronaut_id FROM ml_assessment_requests WHERE assessment_id=?",id);
  if(rows.isEmpty())throw new MlProblem(404,"ASSESSMENT_NOT_FOUND");access(actor,(UUID)rows.get(0).get("astronaut_id"));return detailRow(id);
 }
 @Transactional(readOnly=true)
 public List<Summary> history(UUID astronaut,int limit) {
  access(identity(),astronaut);if(limit<1 || limit>100)throw new MlProblem(400,"INVALID_PAGE_SIZE");
  return jdbc.query("SELECT a.id,a.astronaut_id,a.status,a.error_message,a.requested_at,r.is_synthetic FROM ml_health_assessments a JOIN ml_assessment_requests r ON r.assessment_id=a.id WHERE a.astronaut_id=? ORDER BY a.requested_at DESC,a.id DESC LIMIT ?",
   (r,n)->new Summary(r.getObject("id",UUID.class),r.getObject("astronaut_id",UUID.class),r.getString("status").equals("SUCCEEDED")?"SUCCEEDED":r.getString("error_message"),r.getTimestamp("requested_at").toInstant(),r.getBoolean("is_synthetic")),astronaut,limit);
 }
 private Detail detailRow(UUID id) {
  var row=jdbc.queryForMap("SELECT a.*,a.input_provenance::text AS snapshot,a.result::text AS raw_result,r.is_synthetic FROM ml_health_assessments a JOIN ml_assessment_requests r ON r.assessment_id=a.id WHERE a.id=?",id);
  JsonNode result=row.get("raw_result")==null?null:json.readTree((String)row.get("raw_result"));
  List<String> findings=new ArrayList<>();
  if(result!=null && result.path("finding_codes").isArray())for(JsonNode finding:result.path("finding_codes"))
   if(AresModelContract.CONTEXT_FINDINGS.contains(finding.asText()))findings.add(finding.asText());
  var cms=new TreeMap<String,Countermeasure>();
  for(String finding:findings)for(var cm:knowledge.countermeasures(null,finding))cms.put(cm.code(),cm);
  Prediction prediction=result==null?null:new Prediction(result.path("risk_class").asInt(),result.path("blueprint_label").asText(),false,
   result.path("anomaly_score").asDouble(),result.path("anomaly_threshold").asDouble(),result.path("is_anomaly").asBoolean(),
   AresModelContract.ID,AresModelContract.VERSION,AresModelContract.HASHES);
  Map<String,Object> input=json.readValue((String)row.get("snapshot"),Map.class);
  // Actor identity is audit evidence, not needed in the public educational/assessment DTO.
  input.remove("requestedByAccountId");
  Set<String> indicators=new HashSet<>();for(var cm:cms.values())indicators.addAll(cm.indicatorCodes());
  var topicCards=indicators.isEmpty()?List.<com.augustine.nasa_space_app_backend.dto.KnowledgeResponses.Card>of():knowledge.topics().stream().filter(t->indicators.contains(t.indicatorCode())).toList();
  return new Detail(id,(UUID)row.get("astronaut_id"),(String)row.get("status"),result==null?(String)row.get("error_message"):"SUCCEEDED",
   ((Timestamp)row.get("input_data_cutoff_at")).toInstant(),((Timestamp)row.get("requested_at")).toInstant(),((Timestamp)row.get("completed_at")).toInstant(),
   (Boolean)row.get("is_synthetic"),true,DISCLAIMER,input,prediction,List.copyOf(findings),List.copyOf(cms.values()),topicCards);
 }
}
