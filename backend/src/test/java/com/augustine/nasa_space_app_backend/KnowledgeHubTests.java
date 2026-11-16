package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.jdbc.core.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import javax.sql.DataSource;
import java.sql.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@Transactional
class KnowledgeHubTests extends PostgreSqlIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired JdbcTemplate jdbc;
 @Autowired KnowledgeService service;
 @Autowired AccountRepository accounts;
 @Autowired AstronautRepository astronauts;
 @Autowired DataSource dataSource;
 AccountIdentity officer,astronaut;
 @BeforeEach void identities() {
  var a=astronauts.saveAndFlush(new Astronaut("knowledge-"+UUID.randomUUID(),"Fictional reader"));
  astronaut=account(AccountRole.ASTRONAUT,a.getId());officer=account(AccountRole.NASA_OFFICER,null);
 }
 AccountIdentity account(AccountRole role,UUID astronautId) {
  var a=accounts.saveAndFlush(new Account("knowledge-"+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,astronautId));
  var profile=astronautId==null?null:astronauts.findById(astronautId).orElseThrow();
  return new AccountIdentity(a.getId(),a.getLoginName(),role,profile==null?null:new AccountIdentity.Profile(profile.getId(),profile.getCrewCode(),profile.getDisplayName()));
 }
 void authenticate() {SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(officer));}
 @AfterEach void clear() {SecurityContextHolder.clearContext();}
 void reject(String statement) {
  jdbc.execute((ConnectionCallback<Void>)c->{
   var save=c.setSavepoint();
   try(var s=c.createStatement()) {
    assertThatThrownBy(()->s.execute(statement)).isInstanceOf(SQLException.class)
     .satisfies(e->assertThat(((SQLException)e).getSQLState()).startsWith("23"));
   } finally {c.rollback(save);c.releaseSavepoint(save);}return null;
  });
 }
 void withdraw(String table,String code) {jdbc.update("UPDATE "+table+" SET status='DRAFT' WHERE code=?",code);}
 void publish(String table,String code) {
  jdbc.update("UPDATE "+table+" SET status='PUBLISHED',reviewed_by='test-source-check',reviewed_at=CURRENT_TIMESTAMP,review_note='Test fixture source verification, not clinical authorization' WHERE code=?",code);
 }
 @Test void seedCoversAllNineCatalogFamiliesAndElevenMetricsWithoutClinicalData() {
  authenticate();
  assertThat(service.topics()).hasSize(9);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM knowledge_sections",Integer.class)).isEqualTo(54);
  assertThat(service.findings()).hasSize(11);
  assertThat(service.countermeasures(null,null)).hasSize(6);
  assertThat(jdbc.queryForList("SELECT indicator_code FROM knowledge_topics ORDER BY indicator_code",String.class))
   .containsExactlyElementsOf(jdbc.queryForList("SELECT code FROM health_indicators ORDER BY code",String.class));
  for(var card:service.topics()) {
   var detail=service.topic(card.code());
   assertThat(detail.sections()).hasSize(6).allSatisfy(s->assertThat(s.references()).isNotEmpty());
   assertThat(detail.countermeasures()).isNotEmpty().allSatisfy(c->{assertThat(c.indicatorCodes()).contains(card.indicatorCode());assertThat(c.references()).isNotEmpty();});
   assertThat(card.disclaimer()).contains("nonclinical","individual");
  }
 }
 @Test void bothRolesCanReadEveryEndpointWithSafePlainTextContracts() throws Exception {
  for(var reader:List.of(officer,astronaut)) {
   mvc.perform(get("/api/knowledge/topics").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(9));
   mvc.perform(get("/api/knowledge/topics/muscle-health").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.contentFormat").value("PLAIN_TEXT"))
    .andExpect(jsonPath("$.sections.length()").value(6)).andExpect(jsonPath("$.topic.indicatorCode").value("muscle"));
   mvc.perform(get("/api/knowledge/topics/sleep/sections").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(6));
   mvc.perform(get("/api/knowledge/topics/sleep/sections/SPACEFLIGHT").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.references[0].publisher").value("NASA"));
   mvc.perform(get("/api/knowledge/countermeasures/mission-conditioning").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.authorizationNote").isNotEmpty());
   mvc.perform(get("/api/knowledge/countermeasures").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(6));
   mvc.perform(get("/api/knowledge/findings").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(11));
  }
 }
 @Test void allReadsRequireAuthenticationAndNoEditorialHttpWritesExist() throws Exception {
  for(String path:List.of("topics","topics/sleep","topics/sleep/sections","topics/sleep/sections/MEASURES","countermeasures","countermeasures/sleep-environment","findings"))
   mvc.perform(get("/api/knowledge/"+path)).andExpect(status().isUnauthorized());
  for(var reader:List.of(officer,astronaut)) {
   mvc.perform(post("/api/knowledge/topics").with(authentication(AuthService.authenticationFor(reader))).with(csrf()).contentType("application/json").content("{}"))
    .andExpect(status().isForbidden());
   mvc.perform(post("/api/knowledge/countermeasures").with(authentication(AuthService.authenticationFor(reader))))
    .andExpect(status().isForbidden());
  }
  assertThatThrownBy(()->service.topics()).isInstanceOf(org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class);
 }
 @Test void disabledAccountsCannotReadKnowledge() throws Exception {
  var a=accounts.findById(officer.accountId()).orElseThrow();a.setEnabled(false);accounts.saveAndFlush(a);
  mvc.perform(get("/api/knowledge/topics").with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isUnauthorized());
 }
 @Test void draftsAreHiddenFromCardsDetailsSectionsAndLibrary() throws Exception {
  withdraw("knowledge_topics","sleep");withdraw("knowledge_countermeasures","sleep-environment");
  authenticate();assertThat(service.topics()).hasSize(8);
  assertThat(service.countermeasures(null,null)).extracting(c->c.code()).doesNotContain("sleep-environment");
  for(String path:List.of("topics/sleep","topics/sleep/sections","topics/sleep/sections/MEASURES","countermeasures/sleep-environment"))
   mvc.perform(get("/api/knowledge/"+path).with(authentication(AuthService.authenticationFor(officer)))).andExpect(status().isNotFound());
  authenticate();assertThat(service.topic("mood").countermeasures()).extracting(c->c.code()).doesNotContain("sleep-environment");
 }
 @Test void filtersUseExplicitMappingsIncludingDistinctGripAndMassFindings() {
  authenticate();
  assertThat(service.findings()).filteredOn(f->f.indicatorCode().equals("muscle"))
   .extracting(f->f.metricCode()).containsExactlyInAnyOrder("grip_strength","muscle_mass");
  assertThat(service.countermeasures("muscle","muscle-grip-strength-context"))
   .extracting(c->c.code()).containsExactly("measurement-context","mission-conditioning","nutrition-planning");
  assertThat(service.countermeasures("heart_rate","muscle-grip-strength-context")).isEmpty();
  assertThat(service.countermeasures("body_temperature",null)).extracting(c->c.code()).containsExactly("measurement-context");
 }
 @Test void malformedAndUnknownCodesHaveSafeErrors() throws Exception {
  mvc.perform(get("/api/knowledge/countermeasures").param("indicator","' OR 1=1 --").with(authentication(AuthService.authenticationFor(officer))))
   .andExpect(status().isBadRequest()).andExpect(content().json("{\"error\":\"Invalid knowledge catalog code.\"}"));
  for(String path:List.of("topics/unknown","topics/sleep/sections/UNKNOWN","countermeasures/unknown"))
   mvc.perform(get("/api/knowledge/"+path).with(authentication(AuthService.authenticationFor(officer))))
    .andExpect(status().isNotFound()).andExpect(content().json("{\"error\":\"Published educational content not found.\"}"));
  mvc.perform(get("/api/knowledge/countermeasures").param("finding","unknown").with(authentication(AuthService.authenticationFor(officer))))
   .andExpect(status().isNotFound());
 }
 @Test void publishedContentAndCitationsCannotBeSilentlyRewritten() {
  reject("UPDATE knowledge_topics SET introduction='unreviewed claim' WHERE code='sleep'");
  reject("UPDATE knowledge_sections SET body='unreviewed claim' WHERE topic_code='sleep'");
  reject("DELETE FROM knowledge_citations WHERE topic_code='sleep'");
  reject("UPDATE knowledge_countermeasures SET body='unreviewed prescription' WHERE code='sleep-environment'");
  reject("UPDATE knowledge_references SET url='https://example.invalid' WHERE code='sleep-habits'");
  reject("UPDATE knowledge_assessment_findings SET meaning='Prescribe automatically' WHERE indicator_code='muscle'");
 }
 @Test void withdrawalInvalidatesReviewAndRepublishingRequiresCompleteCitedContent() {
  withdraw("knowledge_topics","sleep");
  assertThat(jdbc.queryForObject("SELECT reviewed_at FROM knowledge_topics WHERE code='sleep'",Timestamp.class)).isNull();
  reject("UPDATE knowledge_topics SET status='PUBLISHED' WHERE code='sleep'");
  jdbc.update("DELETE FROM knowledge_citations WHERE topic_code='sleep' AND section_kind='MEASURES'");
  reject("UPDATE knowledge_topics SET status='PUBLISHED',reviewed_by='test',reviewed_at=CURRENT_TIMESTAMP,review_note='source checked' WHERE code='sleep'");
  jdbc.update("INSERT INTO knowledge_citations(reference_code,topic_code,section_kind) VALUES ('sleep-habits','sleep','MEASURES')");
  publish("knowledge_topics","sleep");authenticate();assertThat(service.topic("sleep").topic().version()).isEqualTo(2);
 }
 @Test void missingCountermeasureCitationsAndMismatchedFindingIndicatorsAreRejected() {
  withdraw("knowledge_countermeasures","measurement-context");
  jdbc.update("DELETE FROM knowledge_citations WHERE countermeasure_code='measurement-context'");
  reject("UPDATE knowledge_countermeasures SET status='PUBLISHED',reviewed_by='test',reviewed_at=CURRENT_TIMESTAMP,review_note='source checked' WHERE code='measurement-context'");
  reject("INSERT INTO knowledge_finding_countermeasures(finding_code,countermeasure_code,indicator_code,rationale) VALUES ('heart-rate-value-context','measurement-context','muscle','Mismatch must fail')");
 }
 @Test void pendingMediaAreHonestAndReplaceableOnlyThroughReviewWorkflow() {
  authenticate();var before=service.topic("sleep").topic().media();
  assertThat(before).hasSize(2).allSatisfy(m->{assertThat(m.available()).isFalse();assertThat(m.reviewStatus()).isEqualTo("PENDING");assertThat(m.sourceCredit()).startsWith("PENDING");});
  reject("UPDATE knowledge_media SET asset_path='/media/knowledge/sleep/new.webp' WHERE topic_code='sleep' AND media_type='IMAGE'");
  withdraw("knowledge_topics","sleep");
  reject("UPDATE knowledge_media SET asset_path='javascript:alert(1)' WHERE topic_code='sleep'");
  reject("UPDATE knowledge_media SET review_status='APPROVED' WHERE topic_code='sleep'");
  jdbc.update("UPDATE knowledge_media SET filename='sleep-approved.webp',asset_path='/media/knowledge/sleep/sleep-approved.webp',alt_text='Reviewed illustration fixture',source_credit='Licensed test fixture',review_status='APPROVED',reviewed_by='test',reviewed_at=CURRENT_TIMESTAMP WHERE topic_code='sleep' AND media_type='IMAGE'");
  publish("knowledge_topics","sleep");
  assertThat(service.topic("sleep").topic().media()).filteredOn(m->m.mediaType().equals("IMAGE")).allSatisfy(m->{assertThat(m.available()).isTrue();assertThat(m.assetPath()).endsWith("sleep-approved.webp");});
 }
 @Test void migrationUpgradesV35WithoutCreatingPatientData() {
  String schema="knowledge_upgrade_"+UUID.randomUUID().toString().replace("-","");
  var old=Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("35").cleanDisabled(true).load();
  old.migrate();old.validate();
  var latest=Flyway.configure().configuration(old.getConfiguration()).target("36").load();
  latest.migrate();latest.validate();assertThat(Arrays.stream(latest.info().applied()).filter(m->m.getVersion()!=null).count()).isEqualTo(36);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM "+schema+".knowledge_topics WHERE status='PUBLISHED'",Integer.class)).isEqualTo(9);
  for(String table:List.of("astronauts","accounts","health_observations","monitoring_rules","health_alerts","ml_health_assessments"))
   assertThat(jdbc.queryForObject("SELECT count(*) FROM "+schema+"."+table,Integer.class)).isZero();
 }
}
