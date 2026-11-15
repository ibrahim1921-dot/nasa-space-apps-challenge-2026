package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.annotation.DirtiesContext;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Explicit live opt-in: real HTTP Python RF + Keras and PostgreSQL 17, not a mocked client. */
@EnabledIfSystemProperty(named="astrohealth.ml.live-test",matches="true")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={"astrohealth.ml.enabled=true","astrohealth.ml.synthetic-vectors-enabled=true","astrohealth.environment=development"})
@DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
@Transactional
class MlTrainedModelTests extends PostgreSqlIntegrationTest {
 @Autowired MlAssessmentService service;@Autowired JdbcTemplate jdbc;
 @Autowired AccountRepository accounts;@Autowired AstronautRepository astronauts;
 @AfterEach void clear(){SecurityContextHolder.clearContext();}
 @Test void realDualEngineHttpPredictionIsPersistedAndRetrievableWithCuratedEducation() {
  UUID astronaut=astronauts.saveAndFlush(new Astronaut("ml-live-"+UUID.randomUUID(),"Fictional synthetic live-vector target")).getId();
  var account=accounts.saveAndFlush(new Account("ml-live-"+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),AccountRole.NASA_OFFICER,null));
  SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(new AccountIdentity(account.getId(),account.getLoginName(),account.getRole(),null)));
  var request=new MlAssessmentDtos.Request(UUID.randomUUID(),Instant.parse("2026-01-02T00:00:00Z"),"EXPLICIT_SYNTHETIC_VECTOR",List.of(),AresTestFixtures.features(),"BLUEPRINT_NATIVE_UNVERIFIED",true);
  var result=service.request(astronaut,request);
  assertThat(result.inferenceStatus()).isEqualTo("SUCCEEDED");assertThat(result.prediction()).isNotNull();
  assertThat(result.prediction().riskClass()).isIn(0,1,2);assertThat(result.prediction().anomalyThreshold()).isEqualTo(AresModelContract.THRESHOLD);
  assertThat(result.prediction().anomalyScore()).isFinite().isGreaterThanOrEqualTo(0);
  assertThat(result.synthetic()).isTrue();assertThat(result.prediction().classSemanticsVerified()).isFalse();
  assertThat(result.countermeasures()).isNotEmpty();assertThat(result.educationalTopics()).isNotEmpty();
  assertThat(service.detail(result.id()).prediction()).isEqualTo(result.prediction());
  assertThat(service.request(astronaut,request).id()).isEqualTo(result.id());
  assertThat(jdbc.queryForObject("SELECT count(*) FROM ml_health_assessments WHERE astronaut_id=?",Integer.class,astronaut)).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM health_alerts WHERE astronaut_id=?",Integer.class,astronaut)).isZero();
  assertThat(jdbc.queryForObject("SELECT result->'model'->>'version' FROM ml_health_assessments WHERE id=?",String.class,result.id())).isEqualTo(AresModelContract.VERSION);
 }
}
