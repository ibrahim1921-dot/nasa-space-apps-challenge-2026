package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import jakarta.validation.Validator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Service
@Transactional
public class MonitoringRuleService implements MonitoringRuleResolver {
 private final JdbcTemplate jdbc;
 private final AuthService auth;
 private final AccountRepository accounts;
 private final AstronautService astronauts;
 private final PersonalBaselineService baselines;
 private final Validator validator;
 private final ObjectMapper json;
 private final Clock clock;
 private final boolean demoEnabled;
 public MonitoringRuleService(JdbcTemplate jdbc, AuthService auth, AccountRepository accounts,
   AstronautService astronauts, PersonalBaselineService baselines, Validator validator, ObjectMapper json,
   Clock clock, @Value("${astrohealth.monitoring.demo-enabled:false}") boolean demoEnabled) {
  this.jdbc=jdbc; this.auth=auth; this.accounts=accounts; this.astronauts=astronauts;
  this.baselines=baselines; this.validator=validator; this.json=json; this.clock=clock; this.demoEnabled=demoEnabled;
 }
 public UUID create(MonitoringRuleRequest r) {
  var actor=officer();
  if(r==null || !validator.validate(r).isEmpty()) throw invalid();
  dimensions(r.astronautId(),r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId());
  if(r.astronautId()!=null) {
   astronauts.getAstronautById(r.astronautId());
   if(jdbc.queryForList("SELECT id FROM astronauts WHERE id=? AND archived_at IS NULL FOR UPDATE",r.astronautId()).isEmpty()) throw invalid();
  }
  finite(r.validFrom()); if(r.validTo()!=null) finite(r.validTo());
  if(r.validFrom().isBefore(clock.instant()) || (r.validTo()!=null && !r.validTo().isAfter(r.validFrom()))
   || !Set.of("ABSOLUTE","BASELINE_DELTA").contains(r.limitKind())
   || !Set.of("INFO","WARNING","CRITICAL").contains(r.severity())
   || !Set.of("CLINICAL_REFERENCE","OPERATIONAL","SYNTHETIC_DEMO").contains(r.designation())
   || (r.lowerBound()==null && r.upperBound()==null)
   || (r.lowerBound()!=null && r.upperBound()!=null && r.lowerBound().compareTo(r.upperBound())>0)) throw invalid();
  boolean synthetic=synthetic(r.comparisonScopeId());
  if((synthetic && !r.designation().equals("SYNTHETIC_DEMO"))
   || (r.designation().equals("SYNTHETIC_DEMO") && (!demoEnabled || (!synthetic && !sharedDefaultScope(r.comparisonScopeId()))))
   || (r.limitKind().equals("BASELINE_DELTA") && (synthetic || r.astronautId()==null || r.designation().equals("SYNTHETIC_DEMO")
    || (r.lowerBound()!=null && r.lowerBound().signum()>0) || (r.upperBound()!=null && r.upperBound().signum()<0)))) throw invalid();
  for(BigDecimal bound:Arrays.asList(r.lowerBound(),r.upperBound())) if(bound!=null) {
   if(bound.scale()>6 || bound.precision()-bound.scale()>12) throw invalid();
   if(r.limitKind().equals("ABSOLUTE")) domain(r.indicatorCode(),r.metricCode(),r.comparisonScopeId(),bound);
  }
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,34))",Object.class,r.ruleCode());
  var previous=jdbc.queryForList("SELECT * FROM monitoring_rules WHERE rule_code=? ORDER BY version DESC LIMIT 1",r.ruleCode());
  int version=previous.isEmpty()?1:((Number)previous.get(0).get("version")).intValue()+1;
  String provenance=json.writeValueAsString(Map.of("approved_by",actor.accountId(),"approval_note",r.approvalNote(),
   "source_reference",r.sourceReference(),"approved_at",clock.instant().toString(),"nonclinical",r.designation().equals("SYNTHETIC_DEMO")));
  return jdbc.queryForObject("INSERT INTO monitoring_rules(rule_code,version,astronaut_id,indicator_code,metric_code,unit,"
   +"activity_context,comparison_scope_id,lower_bound,upper_bound,limit_kind,severity,designation,valid_from,valid_to,source_name,rationale,provenance) "
   +"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb) RETURNING id",UUID.class,r.ruleCode(),version,r.astronautId(),r.indicatorCode(),
   r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId(),r.lowerBound(),r.upperBound(),r.limitKind(),r.severity(),r.designation(),
   ts(r.validFrom()),ts(r.validTo()),r.sourceName(),r.rationale(),provenance);
 }
 public void activation(UUID id,boolean active,Instant effectiveAt,String note) {
  var actor=officer(); finite(effectiveAt);
  if(effectiveAt.isBefore(clock.instant()) || note==null || note.isBlank() || note.length()>2000) throw invalid();
  var rows=jdbc.queryForList("SELECT * FROM monitoring_rules WHERE id=? FOR UPDATE",id);
  if(rows.isEmpty()) throw new BaselineException(404,"Monitoring rule not found.");
  var r=rows.get(0);
  if(active && r.get("astronaut_id")!=null) {
   UUID subject=(UUID)r.get("astronaut_id");
   astronauts.getAstronautById(subject);
   if(jdbc.queryForList("SELECT id FROM astronauts WHERE id=? AND archived_at IS NULL FOR UPDATE",subject).isEmpty()) throw invalid();
  }
  // Legacy rows without approval provenance cannot be promoted implicitly.
  if(active && (jdbc.queryForObject("SELECT jsonb_exists(provenance,'approved_by') AND jsonb_exists(provenance,'source_reference') FROM monitoring_rules WHERE id=?",Boolean.class,id)!=Boolean.TRUE
    || ("SYNTHETIC_DEMO".equals(r.get("designation")) && !demoEnabled))) throw invalid();
  jdbc.update("INSERT INTO monitoring_rule_events(rule_id,active,effective_at,actor_id,note) VALUES (?,?,?,?,?)",id,active,ts(effectiveAt),actor.accountId(),note);
 }
 @Transactional(readOnly=true)
 public List<Map<String,Object>> history() {
  if(identity().role()!=AccountRole.NASA_OFFICER) throw new AccessDeniedException("NASA officer access required.");
  return jdbc.queryForList("SELECT r.*, r.provenance::text AS provenance, COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.effective_at,e.id) FROM monitoring_rule_events e WHERE e.rule_id=r.id),'[]'::jsonb)::text AS activation_history FROM monitoring_rules r ORDER BY rule_code,version");
 }
 @Override @Transactional(readOnly=true)
 public Resolution resolve(UUID astronautId,String indicator,String metric,String unit,String context,UUID scope,Instant at) {
  identity(); astronauts.getAstronautById(astronautId); finite(at);
  return resolveForEvaluation(astronautId,indicator,metric,unit,context,scope,at);
 }
 // Trusted in-process engine only. HTTP callers continue through resolve and its ownership checks.
 @Transactional(readOnly=true,noRollbackFor=BaselineException.class)
 MonitoringRuleResolver.Resolution resolveForEvaluation(UUID astronautId,String indicator,String metric,String unit,String context,UUID scope,Instant at) {
  finite(at);
  dimensions(astronautId,indicator,metric,unit,context,scope);
  return resolveForEvaluation(astronautId,indicator,metric,unit,context,scope,at,synthetic(scope));
 }
 // Only persisted observation provenance supplies this discriminator. It is not an HTTP parameter.
 @Transactional(readOnly=true,noRollbackFor=BaselineException.class)
 MonitoringRuleResolver.Resolution resolveForEvaluation(UUID astronautId,String indicator,String metric,String unit,String context,UUID scope,Instant at,boolean syntheticData) {
  finite(at);
  dimensions(astronautId,indicator,metric,unit,context,scope);
  boolean syntheticScope=synthetic(scope);
  if((!syntheticData && syntheticScope) || (syntheticData && !syntheticScope && !sharedDefaultScope(scope))) return status("INVALID_RULE");
  if(syntheticData && !demoEnabled) return status("DEMO_DISABLED");
  var rows=jdbc.queryForList("SELECT r.* FROM monitoring_rules r WHERE indicator_code=? AND metric_code=? AND unit=? "
   +"AND activity_context=? AND comparison_scope_id=? AND (astronaut_id=? OR astronaut_id IS NULL) "
   +"AND valid_from<=? AND (valid_to IS NULL OR valid_to>?) "
   +"AND COALESCE((SELECT active FROM monitoring_rule_events e WHERE e.rule_id=r.id AND e.effective_at<=? ORDER BY effective_at DESC,id DESC LIMIT 1),false) "
   +"AND NOT EXISTS (SELECT 1 FROM monitoring_rules n WHERE n.rule_code=r.rule_code AND n.version>r.version AND n.valid_from<=? "
   +"AND (n.designation='SYNTHETIC_DEMO')=(r.designation='SYNTHETIC_DEMO') "
   +"AND EXISTS (SELECT 1 FROM monitoring_rule_events ne WHERE ne.rule_id=n.id AND ne.active AND ne.effective_at<=?)) "
   +"ORDER BY (astronaut_id IS NOT NULL) DESC",indicator,metric,unit,context,scope,astronautId,ts(at),ts(at),ts(at),ts(at),ts(at));
  rows.removeIf(r -> syntheticData != "SYNTHETIC_DEMO".equals(r.get("designation")));
  if(rows.isEmpty()) return status("MISSING_RULE");
  var r=rows.get(0);
  if(rows.stream().filter(x -> Objects.equals(x.get("astronaut_id"),r.get("astronaut_id"))).count()>1) return status("CONFLICT");
  BigDecimal lower=(BigDecimal)r.get("lower_bound"),upper=(BigDecimal)r.get("upper_bound"); UUID baselineId=null;
  if("BASELINE_DELTA".equals(r.get("limit_kind"))) {
   var b=baselines.selectForEvaluation(astronautId,indicator,metric,unit,context,scope,at);
   if(!b.status().equals("SELECTED")) return new Resolution("MISSING_BASELINE",(UUID)r.get("id"),
    ((Number)r.get("version")).intValue(),(String)r.get("severity"),(String)r.get("designation"),null,null,null);
   baselineId=b.baselineId(); lower=lower==null?null:b.referenceValue().add(lower); upper=upper==null?null:b.referenceValue().add(upper);
   try {
    if(lower!=null) domain(indicator,metric,scope,lower);
    if(upper!=null) domain(indicator,metric,scope,upper);
   } catch(BaselineException invalidBounds) {
    return new Resolution("INVALID_BASELINE_BOUNDS",(UUID)r.get("id"),((Number)r.get("version")).intValue(),
     (String)r.get("severity"),(String)r.get("designation"),null,null,baselineId);
   }
  }
  return new Resolution("SELECTED",(UUID)r.get("id"),((Number)r.get("version")).intValue(),(String)r.get("severity"),(String)r.get("designation"),lower,upper,baselineId);
 }
 private void dimensions(UUID astronaut,String indicator,String metric,String unit,String context,UUID scope) {
  Integer count=jdbc.queryForObject("SELECT count(*) FROM measurement_comparison_scopes s JOIN indicator_metrics m ON m.indicator_code=s.indicator_code "
   +"JOIN indicator_contexts c ON c.indicator_code=s.indicator_code WHERE s.id=? AND s.indicator_code=? AND m.metric_code=? AND m.unit=? AND c.activity_context=? "
   +"AND (s.radiation_astronaut_id IS NULL OR s.radiation_astronaut_id=?)",Integer.class,scope,indicator,metric,unit,context,astronaut);
  if(count==null || count!=1) throw invalid();
 }
 private boolean synthetic(UUID scope) {
  return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_jsonb(s)::text ~* '(simulation|synthetic)' OR EXISTS (SELECT 1 FROM simulation_scope_provisioning_audit a WHERE a.scope_id=s.id) FROM measurement_comparison_scopes s WHERE id=?",Boolean.class,scope));
 }
 // These five existing generic scopes describe technique/unit, not observation origin.
 // Specialized real scopes (site/protocol/scale/radiation) cannot be used for demo evaluation.
 boolean sharedDefaultScope(UUID scope) {
  return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM measurement_comparison_scopes WHERE id=? AND scope_code='default' "
   +"AND indicator_code IN ('heart_rate','blood_pressure','blood_sugar','body_temperature','sleep_hours'))",Boolean.class,scope));
 }
 private void domain(String indicator,String metric,UUID scope,BigDecimal value) {
  if((Set.of("blood_pressure","bone_mineral_density").contains(indicator) || metric.equals("muscle_mass")) && value.signum()<=0) throw invalid();
  if(Set.of("sleep_hours","muscle","cumulative_absorbed_radiation_dose").contains(indicator) && value.signum()<0) throw invalid();
  if(indicator.equals("mood") && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT ? BETWEEN scale_min AND scale_max FROM measurement_comparison_scopes WHERE id=?",Boolean.class,value,scope))) throw invalid();
 }
 private AccountIdentity identity() {
  var a=SecurityContextHolder.getContext().getAuthentication();
  if(a==null || !a.isAuthenticated() || !(a.getPrincipal() instanceof AccountPrincipal p)) throw new AuthenticationCredentialsNotFoundException("Authentication required.");
  return auth.currentIdentity(p.accountId());
 }
 private AccountIdentity officer() {
  var authentication=SecurityContextHolder.getContext().getAuthentication();
  if(authentication==null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof AccountPrincipal principal))
   throw new AuthenticationCredentialsNotFoundException("Authentication required.");
  accounts.findLockedById(principal.accountId()).orElseThrow(()->new AccessDeniedException("Account unavailable."));
  var actor=identity();
  if(actor.role()!=AccountRole.NASA_OFFICER) throw new AccessDeniedException("NASA officer access required.");
  return actor;
 }
 private static Resolution status(String status) { return new Resolution(status,null,null,null,null,null,null,null); }
 private static void finite(Instant at) {
  if(at==null || at.isBefore(Instant.parse("0001-01-01T00:00:00Z")) || at.isAfter(Instant.parse("9999-12-31T23:59:59Z")) || at.getNano()%1000!=0) throw invalid();
 }
 private static Timestamp ts(Instant at) { return at==null?null:Timestamp.from(at); }
 private static BaselineException invalid() { return new BaselineException(400,"Invalid monitoring rule dimensions, provenance, bounds or effective time."); }
}
