package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.dto.HealthAlertResponses.Detail;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;

/** Committed concurrency fixtures stay in their own disposable schema. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.flyway.schemas=health_alert_lifecycle_tests","spring.flyway.default-schema=health_alert_lifecycle_tests",
 "spring.datasource.hikari.connection-init-sql=SET search_path TO health_alert_lifecycle_tests",
 "spring.jpa.properties.hibernate.default_schema=health_alert_lifecycle_tests"})
class HealthAlertLifecycleConcurrencyTests extends PostgreSqlIntegrationTest {
 @Autowired JdbcTemplate jdbc;
 @Autowired AstronautRepository astronauts;
 @Autowired AccountRepository accounts;
 @Autowired HealthAlertService service;
 @Autowired PlatformTransactionManager manager;
 AccountIdentity first,second;
 UUID alert;
 @BeforeEach void fixture() {
  new TransactionTemplate(manager).executeWithoutResult(status->{
   UUID subject=astronauts.saveAndFlush(new Astronaut("alert-race-"+UUID.randomUUID(),"Concurrency fixture")).getId();
   first=officer(); second=officer();
   alert=jdbc.queryForObject("INSERT INTO health_alerts(astronaut_id,severity,trigger_kind,source_name,reason,triggered_at) VALUES (?,'WARNING','MANUAL','Fixture','Fixture review',?) RETURNING id",UUID.class,subject,java.sql.Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
  });
 }
 @Test void concurrentAcknowledgementsHaveOneTimestampAndOneAuditEvent() throws Exception {
  List<Object> results=race(()->as(first,()->service.acknowledge(alert)),()->as(second,()->service.acknowledge(alert)));
  assertThat(results).allMatch(r->r instanceof Detail);
  var a=(Detail)results.get(0); var b=(Detail)results.get(1);
  assertThat(a.alert().acknowledgedAt()).isEqualTo(b.alert().acknowledgedAt());
  assertThat(events("ACKNOWLEDGED")).isEqualTo(1);
  assertThat(jdbc.queryForObject("SELECT actor FROM health_alert_events WHERE alert_id=? AND event_kind='ACKNOWLEDGED'",String.class,alert)).isIn(first.accountId().toString(),second.accountId().toString());
 }
 @Test void identicalConcurrentResolutionsAreIdempotent() throws Exception {
  as(first,()->service.acknowledge(alert));
  List<Object> results=race(()->as(first,()->service.resolve(alert,"Same fixture note")),()->as(second,()->service.resolve(alert,"Same fixture note")));
  assertThat(results).allMatch(r->r instanceof Detail);
  assertThat(((Detail)results.get(0)).alert().resolvedAt()).isEqualTo(((Detail)results.get(1)).alert().resolvedAt());
  assertThat(events("RESOLVED")).isEqualTo(1);
 }
 @Test void competingResolutionNotesProduceOneSuccessAndOneConflict() throws Exception {
  as(first,()->service.acknowledge(alert));
  List<Object> results=race(()->as(first,()->service.resolve(alert,"First fixture note")),()->as(second,()->service.resolve(alert,"Second fixture note")));
  assertThat(results.stream().filter(r->r instanceof Detail).count()).isEqualTo(1);
  assertThat(results.stream().filter(r->r instanceof HealthAlertException e && e.status()==409).count()).isEqualTo(1);
  assertThat(events("RESOLVED")).isEqualTo(1);
 }
 private int events(String kind) {return Objects.requireNonNull(jdbc.queryForObject("SELECT count(*) FROM health_alert_events WHERE alert_id=? AND event_kind=?",Integer.class,alert,kind));}
 private AccountIdentity officer() {Account a=accounts.saveAndFlush(new Account("alert.race."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),AccountRole.NASA_OFFICER,null));return new AccountIdentity(a.getId(),a.getLoginName(),a.getRole(),null);}
 private <T>T as(AccountIdentity identity,Supplier<T> work) {SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(identity));try{return work.get();}finally{SecurityContextHolder.clearContext();}}
 private List<Object> race(Supplier<Detail> a,Supplier<Detail> b) throws Exception {
  var executor=Executors.newFixedThreadPool(2); var gate=new CountDownLatch(1);
  try {
   var one=executor.submit(()->invoke(gate,a)); var two=executor.submit(()->invoke(gate,b)); gate.countDown();
   return List.of(one.get(30,TimeUnit.SECONDS),two.get(30,TimeUnit.SECONDS));
  } finally {executor.shutdownNow();}
 }
 private Object invoke(CountDownLatch gate,Supplier<Detail> work) throws InterruptedException {gate.await();try{return work.get();}catch(HealthAlertException conflict){return conflict;}}
}
