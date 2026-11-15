package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.dto.MlAssessmentDtos.Request;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.jdbc.core.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.*;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK,properties={"astrohealth.ml.enabled=true","astrohealth.ml.synthetic-vectors-enabled=true","astrohealth.environment=development","astrohealth.ml.request-timeout-ms=200"})
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@Transactional
class MlAssessmentTests extends PostgreSqlIntegrationTest {
 static final String TOKEN="mock-test-token-"+"x".repeat(32);
 static final AtomicInteger calls=new AtomicInteger();static volatile String behavior="ok";
 static final ExecutorService workers=Executors.newCachedThreadPool(r->{var t=new Thread(r);t.setDaemon(true);return t;});
 static final HttpServer server=server();
 static HttpServer server() {
  try {
   var s=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);s.setExecutor(workers);
   s.createContext("/api/v1/diagnostics/assess",exchange->{
    calls.incrementAndGet();String mode=behavior;
    try {
     String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
     if(!exchange.getRequestHeaders().getFirst("Authorization").equals("Bearer "+TOKEN) || !body.contains("BLUEPRINT_NATIVE_UNVERIFIED"))throw new IllegalStateException("Mock client contract failed");
     if(mode.equals("slow"))try{Thread.sleep(600);}catch(InterruptedException e){Thread.currentThread().interrupt();}
     ObjectMapper json=JsonMapper.builder().build();
     if(!json.readTree(body).path("features").path("mood").isIntegralNumber())throw new IllegalStateException("Mood must be a JSON integer");
     var result=AresTestFixtures.result();
     if(mode.equals("invalid"))result.put("anomaly_threshold",999);
     byte[] response=(mode.equals("oversize")?"x".repeat(100000):json.writeValueAsString(result)).getBytes(StandardCharsets.UTF_8);
     exchange.sendResponseHeaders(mode.equals("down")?503:200,response.length);exchange.getResponseBody().write(response);
    } catch(Exception ignored) { } finally {exchange.close();}
   });s.start();return s;
  } catch(Exception e){throw new ExceptionInInitializerError(e);}
 }
 @DynamicPropertySource static void client(DynamicPropertyRegistry p) {
  p.add("astrohealth.ml.endpoint",()->"http://127.0.0.1:"+server.getAddress().getPort());p.add("astrohealth.ml.token",()->TOKEN);
 }
 @AfterAll static void stop(){server.stop(0);workers.shutdownNow();}
 @Autowired MockMvc mvc;@Autowired JdbcTemplate jdbc;@Autowired ObjectMapper json;
 @Autowired MlAssessmentService service;@Autowired MlObservationInputs inputs;
 @Autowired AuthService auth;@Autowired MlInferenceClient inference;@Autowired KnowledgeService knowledge;
 @Autowired AccountRepository accounts;@Autowired AstronautRepository astronauts;
 UUID subject,other;AccountIdentity officer,reader;
 final Instant cutoff=Instant.parse("2026-01-02T12:00:00Z");
 @BeforeEach void fixture() {
  behavior="ok";calls.set(0);
  var a=astronauts.saveAndFlush(new Astronaut("ml-fixture-"+UUID.randomUUID(),"Synthetic ML fixture"));subject=a.getId();
  other=astronauts.saveAndFlush(new Astronaut("ml-other-"+UUID.randomUUID(),"Other synthetic fixture")).getId();
  reader=account(AccountRole.ASTRONAUT,a);officer=account(AccountRole.NASA_OFFICER,null);authenticate(officer);
 }
 AccountIdentity account(AccountRole role,Astronaut astronaut) {
  var a=accounts.saveAndFlush(new Account("ml-"+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,astronaut==null?null:astronaut.getId()));
  return new AccountIdentity(a.getId(),a.getLoginName(),role,astronaut==null?null:new AccountIdentity.Profile(astronaut.getId(),astronaut.getCrewCode(),astronaut.getDisplayName()));
 }
 void authenticate(AccountIdentity actor){SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(actor));}
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 Request vector(){return new Request(UUID.randomUUID(),cutoff,"EXPLICIT_SYNTHETIC_VECTOR",List.of(),AresTestFixtures.features(),"BLUEPRINT_NATIVE_UNVERIFIED",true);}
 Request observed(List<UUID> ids){return new Request(UUID.randomUUID(),cutoff,"OBSERVATIONS",ids,null,null,null);}
 String path(){return "/api/crew/"+subject+"/ml-assessments";}
 @Test void successfulMockExecutionPersistsRawInputsFingerprintsAuditAndEducationWithoutAlerts() {
  var result=service.request(subject,vector());
  assertThat(result.inferenceStatus()).isEqualTo("SUCCEEDED");assertThat(result.synthetic()).isTrue();assertThat(result.nonclinical()).isTrue();
  assertThat(result.prediction().modelVersion()).isEqualTo(AresModelContract.VERSION);
  assertThat(result.prediction().classSemanticsVerified()).isFalse();
  assertThat(result.findingCodes()).containsExactlyElementsOf(AresModelContract.CONTEXT_FINDINGS);
  assertThat(result.findingCodes()).noneMatch(s->s.contains("areal-density") || s.contains("grip") || s.contains("absorbed-radiation"));
  assertThat(result.countermeasures()).isNotEmpty().allSatisfy(c->{assertThat(c.authorizationNote()).contains("Educational");assertThat(c.references()).isNotEmpty();});
  assertThat(result.educationalTopics()).isNotEmpty().allSatisfy(t->assertThat(t.media()).hasSize(2).allSatisfy(m->assertThat(m.available()).isFalse()));
  String raw=jdbc.queryForObject("SELECT result::text FROM ml_health_assessments WHERE id=?",String.class,result.id());
  assertThat(raw).contains("risk_probabilities","artifact_sha256","finding_codes");
  assertThat(jdbc.queryForObject("SELECT requested_by_account_id FROM ml_assessment_requests WHERE assessment_id=?",UUID.class,result.id())).isEqualTo(officer.accountId());
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_alerts WHERE astronaut_id=?",Integer.class,subject)).isZero();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_evaluation_outbox",Integer.class)).isZero();
 }
 @Test void repeatRequestIsIdempotentAndChangedPayloadConflicts() {
  var request=vector();var first=service.request(subject,request);var second=service.request(subject,request);
  assertThat(second.id()).isEqualTo(first.id());assertThat(calls).hasValue(1);
  var changed=new TreeMap<>(request.features());changed.put("heart_rate",99.0);
  assertThatThrownBy(()->service.request(subject,new Request(request.requestKey(),cutoff,request.inputMode(),List.of(),changed,request.unitSystem(),true)))
   .isInstanceOf(MlProblem.class).hasMessage("IDEMPOTENCY_CONFLICT");
  assertThat(calls).hasValue(1);
 }
 @Test @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
 void concurrentSameKeyCreatesOneExecution() throws Exception {
  var request=vector();var start=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
  try {
   Callable<UUID> task=()->{authenticate(officer);try{start.await();return service.request(subject,request).id();}finally{SecurityContextHolder.clearContext();}};
   var a=pool.submit(task);var b=pool.submit(task);start.countDown();
   assertThat(a.get(15,TimeUnit.SECONDS)).isEqualTo(b.get(15,TimeUnit.SECONDS));assertThat(calls).hasValue(1);
  } finally {pool.shutdownNow();}
 }
 @Test void featureFlagsAndEnvironmentFailClosed() {
  var disabled=new MlAssessmentService(jdbc,json,auth,inputs,inference,knowledge,false,false,"development");
  assertThatThrownBy(()->disabled.request(subject,vector())).isInstanceOf(MlProblem.class).hasMessage("ML_ASSESSMENTS_DISABLED");
  var production=new MlAssessmentService(jdbc,json,auth,inputs,inference,knowledge,true,true,"production");
  assertThatThrownBy(()->production.request(subject,vector())).isInstanceOf(MlProblem.class).hasMessage("SYNTHETIC_VECTORS_DISABLED");
  assertThat(calls).hasValue(0);
 }
 @Test void missingInputsPersistExplicitInsufficientDataWithoutCallingModel() {
  var result=service.request(subject,observed(List.of()));
  assertThat(result.inferenceStatus()).isEqualTo("INSUFFICIENT_DATA");assertThat(result.prediction()).isNull();assertThat(result.countermeasures()).isEmpty();
  assertThat(result.inputSnapshot().get("issues").toString()).contains("MISSING_INDICATOR","AREAL_BONE_DENSITY_IS_NOT_T_SCORE","GRIP_KGF_TO_MODEL_KG_PROTOCOL_UNCONFIRMED");
  assertThat(calls).hasValue(0);
 }
 @Test void selectedObservationsRetainSyntheticProvenanceAndNeverSubstituteDefaults() {
  UUID id=heart(subject,cutoff.minusSeconds(60));
  var result=service.request(subject,observed(List.of(id)));
  assertThat(result.synthetic()).isTrue();assertThat(result.prediction()).isNull();
  assertThat(result.inputSnapshot()).doesNotContainKey("features");
  assertThat(jdbc.queryForObject("SELECT observation_id FROM ml_assessment_observations WHERE assessment_id=?",UUID.class,result.id())).isEqualTo(id);
  assertThat(calls).hasValue(0);
 }
 @Test void staleAndAsynchronousInputsAreReported() {
  var result=service.request(subject,observed(List.of(heart(subject,cutoff.minusSeconds(90000)),heart(subject,cutoff.minusSeconds(10)))));
  assertThat(result.inputSnapshot().get("issues").toString()).contains("STALE_OBSERVATION","ASYNCHRONOUS_MEASUREMENTS");
  assertThat(result.inferenceStatus()).isEqualTo("INSUFFICIENT_DATA");assertThat(calls).hasValue(0);
 }
 @Test void anotherAstronautsObservationsAreUnavailable() {
  UUID id=heart(other,cutoff.minusSeconds(10));
  assertThatThrownBy(()->service.request(subject,observed(List.of(id)))).isInstanceOf(MlProblem.class).hasMessage("OBSERVATION_NOT_AVAILABLE");
 }
 @Test void allNineFamiliesStillRejectIncompatibleTScoreGripAndDailyDoseSemantics() {
  UUID heart=heart(subject,cutoff.minusSeconds(60));
  for(String indicator:List.of("blood_pressure","blood_sugar","body_temperature","sleep_hours","mood","muscle","bone_mineral_density","cumulative_absorbed_radiation_dose"))typedReading(indicator,cutoff.minusSeconds(60));
  var result=service.request(subject,observed(List.of()));
  assertThat(result.inferenceStatus()).isEqualTo("INCOMPATIBLE_FEATURES");
  assertThat(result.inputSnapshot().get("issues").toString()).contains("AREAL_BONE_DENSITY_IS_NOT_T_SCORE","GRIP_KGF_TO_MODEL_KG_PROTOCOL_UNCONFIRMED","RADIATION_TRAINING_DAILY_WINDOW_UNCONFIRMED").doesNotContain("MISSING_INDICATOR");
  assertThat(result.prediction()).isNull();assertThat(calls).hasValue(0);
 }
 @Test void legitimateCumulativeReadingsProduceOnlyAnExplicitUnconfirmedAverageRate() {
  UUID earlier=typedReading("cumulative_absorbed_radiation_dose",cutoff.minusSeconds(86400));
  UUID scope=jdbc.queryForObject("SELECT comparison_scope_id FROM health_observations WHERE id=?",UUID.class,earlier);
  UUID later=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,provenance) VALUES (?,'cumulative_absorbed_radiation_dose','SCALAR',?,'UNKNOWN',?,'IMPORT','Synthetic test','{\"synthetic\":true}') RETURNING id",UUID.class,subject,scope,Timestamp.from(cutoff));
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'cumulative_absorbed_radiation_dose',0.4,'mGy')",later);
  var result=service.request(subject,observed(List.of(earlier,later)));
  assertThat(result.inputSnapshot().get("candidateRadiationRates").toString()).contains("averageAbsorbedDoseRateMgyPerDay=0.2","trainingWindowCompatible=false");
  assertThat(result.prediction()).isNull();assertThat(calls).hasValue(0);
 }
 @Test void outageAndTimeoutPersistSafeFailuresWithoutRetryingSameRequest() {
  for(String mode:List.of("down","slow","invalid","oversize")) {
   behavior=mode;var request=vector();var result=service.request(subject,request);
   assertThat(result.inferenceStatus()).isIn("MODEL_SERVICE_UNAVAILABLE","INVALID_MODEL_RESPONSE");
   assertThat(result.executionStatus()).isEqualTo("FAILED");assertThat(result.prediction()).isNull();
   assertThat(service.request(subject,request).id()).isEqualTo(result.id());
  }
  assertThat(calls).hasValue(4);
 }
 @Test void anonymousRoleOwnershipAndCsrfControlsRemainIntact() throws Exception {
  var result=service.request(subject,vector());
  mvc.perform(get("/api/ml-assessments/"+result.id())).andExpect(status().isUnauthorized());
  mvc.perform(post(path()).with(authentication(AuthService.authenticationFor(officer))).contentType("application/json").content(json.writeValueAsString(vector()))).andExpect(status().isForbidden());
  mvc.perform(post(path()).with(authentication(AuthService.authenticationFor(reader))).with(csrf()).contentType("application/json").content(json.writeValueAsString(vector()))).andExpect(status().isForbidden());
  mvc.perform(get("/api/ml-assessments/"+result.id()).with(authentication(AuthService.authenticationFor(reader)))).andExpect(status().isOk()).andExpect(jsonPath("$.synthetic").value(true));
  mvc.perform(get("/api/crew/"+other+"/ml-assessments").with(authentication(AuthService.authenticationFor(reader)))).andExpect(status().isNotFound());
  mvc.perform(get(path()).with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(result.id().toString()));
 }
 @Test void crossAstronautDetailsAndDisabledUsersAreDenied() throws Exception {
  var result=service.request(other,vector());
  mvc.perform(get("/api/ml-assessments/"+result.id()).with(authentication(AuthService.authenticationFor(reader)))).andExpect(status().isNotFound());
  var account=accounts.findById(officer.accountId()).orElseThrow();account.setEnabled(false);accounts.saveAndFlush(account);
  mvc.perform(get("/api/ml-assessments/"+result.id()).with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isUnauthorized());
 }
 @Test void completedRowsAndInputAuditAreImmutable() {
  var result=service.request(subject,vector());
  reject("UPDATE ml_health_assessments SET result='{}' WHERE id='"+result.id()+"'");
  reject("DELETE FROM ml_health_assessments WHERE id='"+result.id()+"'");
  reject("UPDATE ml_assessment_requests SET is_synthetic=false WHERE assessment_id='"+result.id()+"'");
  var selected=service.request(subject,observed(List.of(heart(subject,cutoff.minusSeconds(60)))));
  reject("DELETE FROM ml_assessment_observations WHERE assessment_id='"+selected.id()+"'");
 }
 @Test void validatedHttpRequestAndInvalidMoodOrUnitSystem() throws Exception {
  mvc.perform(post(path()).with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json").content(json.writeValueAsString(vector())))
   .andExpect(status().isOk()).andExpect(jsonPath("$.inferenceStatus").value("SUCCEEDED"));
  var request=vector();var invalid=new TreeMap<>(request.features());invalid.put("mood",2.5);
  mvc.perform(post(path()).with(authentication(AuthService.authenticationFor(officer))).with(csrf()).contentType("application/json")
   .content(json.writeValueAsString(new Request(request.requestKey(),cutoff,request.inputMode(),List.of(),invalid,request.unitSystem(),true))))
   .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_FEATURES"));
 }
 UUID heart(UUID subject,Instant measured) {
  UUID scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
  UUID id=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,provenance) VALUES (?,'heart_rate','SCALAR',?,'RESTING',?,'IMPORT','Synthetic ML fixture','{\"synthetic\":true}'::jsonb) RETURNING id",UUID.class,subject,scope,Timestamp.from(measured));
  jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',60,'beats/min')",id);
  return id;
 }
 UUID typedReading(String indicator,Instant measured) {
  String kind=jdbc.queryForObject("SELECT storage_kind FROM health_indicators WHERE code=?",String.class,indicator);
  UUID scope;
  if(List.of("blood_pressure","blood_sugar","body_temperature","sleep_hours").contains(indicator))
   scope=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code=? AND scope_code='default'",UUID.class,indicator);
  else if(indicator.equals("mood"))scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,scale_name,scale_version,scale_min,scale_max) VALUES (?,'mood','MOOD','UNVERIFIED_TEST_SCALE','1',1,5) RETURNING id",UUID.class,"ml-test-"+UUID.randomUUID());
  else if(kind.equals("MUSCLE") || kind.equals("BONE"))scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,protocol_code,protocol_version) VALUES (?,?,?,'TEST_SITE','UNVERIFIED_TEST_PROTOCOL','1') RETURNING id",UUID.class,"ml-test-"+UUID.randomUUID(),indicator,kind);
  else scope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,radiation_astronaut_id,accumulation_started_at,dosimetry_method) VALUES (?,'cumulative_absorbed_radiation_dose','SCALAR','WHOLE_BODY',?,?,'SYNTHETIC_TEST_ABSORBED_DOSE') RETURNING id",UUID.class,"ml-test-"+UUID.randomUUID(),subject,Timestamp.from(cutoff.minusSeconds(172800)));
  UUID id=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,measured_at,source_kind,source_name,provenance) VALUES (?,?,?,?,'UNKNOWN',?,'IMPORT','Synthetic ML fixture','{\"synthetic\":true}') RETURNING id",UUID.class,subject,indicator,kind,scope,Timestamp.from(measured));
  switch(kind) {
   case "SCALAR"->jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,?,?,?)",id,indicator,indicator.startsWith("cumulative")?0.2:indicator.equals("blood_sugar")?5:36.8,indicator.startsWith("cumulative")?"mGy":indicator.equals("blood_sugar")?"mmol/L":"Cel");
   case "BLOOD_PRESSURE"->jdbc.update("INSERT INTO blood_pressure_observations(observation_id,systolic,diastolic,unit,method) VALUES (?,115,75,'mmHg','SYNTHETIC_TEST')",id);
   case "SLEEP"->jdbc.update("INSERT INTO sleep_sessions(observation_id,started_at,ended_at,asleep_seconds) VALUES (?,?,?,28800)",id,Timestamp.from(measured.minusSeconds(28800)),Timestamp.from(measured));
   case "MOOD"->jdbc.update("INSERT INTO mood_assessments(observation_id,score,unit) VALUES (?,2,'score')",id);
   case "MUSCLE"->jdbc.update("INSERT INTO muscle_assessments(observation_id,grip_strength_kgf) VALUES (?,42.5)",id);
   case "BONE"->jdbc.update("INSERT INTO bone_density_examinations(observation_id,areal_density,unit) VALUES (?,1,'g/cm2')",id);
  }
  return id;
 }
 void reject(String sql) {
  jdbc.execute((ConnectionCallback<Void>)c->{var save=c.setSavepoint();try(var s=c.createStatement()){
   assertThatThrownBy(()->s.execute(sql)).isInstanceOf(SQLException.class).satisfies(e->assertThat(((SQLException)e).getSQLState()).startsWith("23"));
  }finally{c.rollback(save);c.releaseSavepoint(save);}return null;});
 }
}
