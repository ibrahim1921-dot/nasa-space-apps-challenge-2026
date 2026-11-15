package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.BaselineRequest;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** All numeric values here are arbitrary test fixtures, never approved clinical values. */
@Transactional
class PersonalBaselineTests extends PostgreSqlIntegrationTest {
    @Autowired PersonalBaselineService service;
    @Autowired AstronautRepository astronauts;
    @Autowired AccountRepository accounts;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    UUID subject, scope;
    Account author, approver;
    Instant input, start;

    @BeforeEach void fixture() {
        subject = astronauts.saveAndFlush(new Astronaut("baseline-"+UUID.randomUUID(),"Baseline test fixture")).getId();
        author = account(AccountRole.NASA_OFFICER,null);
        approver = account(AccountRole.NASA_OFFICER,null);
        scope = jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code='heart_rate' AND scope_code='default'",UUID.class);
        input = Instant.now().minus(1,ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        start = Instant.now().plus(1,ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        signIn(author);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest @ValueSource(strings={"RESTING","SLEEPING","EXERCISING","OTHER","UNKNOWN"})
    void exactActivitySelectionRequiresApprovalAndNeverFallsBack(String context) {
        UUID proposal=service.propose(subject,request(context,"ORIGINAL",start,null,null));
        assertThat(select(context,start).status()).isEqualTo("MISSING");
        signIn(approver);
        UUID baseline=service.approve(subject,proposal,"Fixture review only");
        assertThat(select(context,start).baselineId()).isEqualTo(baseline);
        assertThat(select(context,start.minusNanos(1000)).status()).isEqualTo("MISSING");
        String other=context.equals("RESTING")?"EXERCISING":"RESTING";
        assertThat(select(other,start).status()).isEqualTo("MISSING");
        assertThat(service.approve(subject,proposal,"Retry")).isEqualTo(baseline);
    }

    @Test void rollingPrecedesOriginalOnlyDuringItsHalfOpenPeriod() {
        UUID original=approve(request("RESTING","ORIGINAL",start,null,null));
        Instant end=start.plus(1,ChronoUnit.DAYS);
        var r=request("RESTING","ROLLING",start,null,null);
        r=new BaselineRequest(r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId(),r.baselineKind(),
                r.referenceValue(),r.effectiveFrom(),end,r.inputFrom(),r.inputTo(),r.method(),r.sourceName(),r.observationIds(),null,null);
        UUID rolling=approve(r);
        assertThat(select("RESTING",start).baselineId()).isEqualTo(rolling);
        assertThat(select("RESTING",end).baselineId()).isEqualTo(original);
    }

    @Test void correctionsAppendVersionsAndRetainOriginalSnapshots() {
        UUID original=approve(request("RESTING","ORIGINAL",start,null,null));
        Instant next=start.plus(1,ChronoUnit.DAYS);
        UUID corrected=approve(request("RESTING","ORIGINAL",next,original,"Corrected fixture"));
        assertThat(select("RESTING",start).baselineId()).isEqualTo(original);
        assertThat(select("RESTING",next).baselineId()).isEqualTo(corrected);
        assertThat(select("RESTING",next).version()).isEqualTo(2);
        assertThat(service.history(subject)).hasSize(2);
        assertThat(service.versions(subject)).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT effective_to FROM personal_baselines WHERE id=?",Timestamp.class,original).toInstant()).isEqualTo(next);
        assertThat(jdbc.queryForObject("SELECT provenance->>'source_type' FROM personal_baselines WHERE id=?",String.class,corrected)).isEqualTo("REAL_OBSERVATIONS");
    }

    @Test void conflictingUnlinkedBaselineCannotBeApproved() {
        approve(request("RESTING","ORIGINAL",start,null,null));
        signIn(author);
        UUID proposal=service.propose(subject,request("RESTING","ORIGINAL",start,null,null));
        signIn(approver);
        assertThatThrownBy(()->service.approve(subject,proposal,"Fixture review")).isInstanceOf(BaselineException.class)
                .hasMessageContaining("Conflicting");
    }

    @Test
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void simultaneousConflictingApprovalsProduceOnlyOneBaseline() throws Exception {
        var tx=new org.springframework.transaction.support.TransactionTemplate(transactions);
        UUID first=tx.execute(status->service.propose(subject,request("RESTING","ORIGINAL",start,null,null)));
        UUID second=tx.execute(status->service.propose(subject,request("RESTING","ORIGINAL",start,null,null)));
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var ready=new java.util.concurrent.CountDownLatch(2);
        var go=new java.util.concurrent.CountDownLatch(1);
        try {
            var futures=new ArrayList<java.util.concurrent.Future<String>>();
            for (UUID proposal:List.of(first,second)) futures.add(executor.submit(()->{
                signIn(approver); ready.countDown();
                try {
                    if (!go.await(5,java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Start timed out");
                    service.approve(subject,proposal,"Concurrent fixture review"); return "approved";
                } catch (BaselineException error) { assertThat(error.status()).isEqualTo(409); return "conflict";
                } finally { SecurityContextHolder.clearContext(); }
            }));
            assertThat(ready.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue(); go.countDown();
            var results=new ArrayList<String>();
            for (var future:futures) results.add(future.get(15,java.util.concurrent.TimeUnit.SECONDS));
            assertThat(results).containsExactlyInAnyOrder("approved","conflict");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM personal_baselines WHERE astronaut_id=?",Integer.class,subject)).isEqualTo(1);
        } finally { go.countDown(); executor.shutdownNow(); }
    }

    @Test void overlappingSqlInsertIsRejectedEvenWithNextVersionLink() {
        UUID id=approve(request("RESTING","ORIGINAL",start,null,null));
        assertThatThrownBy(()->jdbc.update("INSERT INTO personal_baselines(astronaut_id,indicator_code,metric_code,unit,activity_context,"
                + "comparison_scope_id,baseline_kind,version,reference_value,effective_from,input_from,input_to,sample_count,method,source_name,"
                + "provenance,supersedes_baseline_id,correction_reason) SELECT astronaut_id,indicator_code,metric_code,unit,activity_context,"
                + "comparison_scope_id,baseline_kind,2,reference_value,effective_from,input_from,input_to,sample_count,method,source_name,"
                + "provenance,id,'Fixture correction' FROM personal_baselines WHERE id=?",id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test void duplicateEvidenceIsRejected() {
        var r=request("RESTING","ORIGINAL",start,null,null);
        var duplicated=withEvidence(r,List.of(r.observationIds().get(0),r.observationIds().get(0)));
        assertThatThrownBy(()->service.propose(subject,duplicated)).isInstanceOf(BaselineException.class);
    }

    @Test void retroactiveBaselineIsRejected() {
        var r=request("RESTING","ORIGINAL",input,null,null);
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class);
    }

    @Test void selfApprovalIsDenied() {
        UUID proposal=service.propose(subject,request("RESTING","ORIGINAL",start,null,null));
        assertThatThrownBy(()->service.approve(subject,proposal,"Self review")).isInstanceOf(AccessDeniedException.class);
    }

    @Test void astronautCanReadOnlyOwnBaselineHistoryAndCannotWrite() {
        approve(request("RESTING","ORIGINAL",start,null,null));
        signIn(account(AccountRole.ASTRONAUT,subject));
        assertThat(service.history(subject)).hasSize(1);
        assertThat(select("RESTING",start).status()).isEqualTo("SELECTED");
        UUID other=astronauts.saveAndFlush(new Astronaut("other-"+UUID.randomUUID(),"Other fixture")).getId();
        assertThatThrownBy(()->service.history(other)).isInstanceOf(AccessDeniedException.class);
        var r=request("RESTING","ORIGINAL",start,null,null);
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void anonymousServiceCallsAreDenied() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(()->service.history(subject)).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
    }

    @Test void disabledOfficerIsDeniedEvenWithCachedPrincipal() {
        author.setEnabled(false); accounts.saveAndFlush(author);
        assertThatThrownBy(()->service.history(subject)).isInstanceOf(org.springframework.security.core.AuthenticationException.class);
    }

    @Test void archivedAstronautCannotReceiveProposals() {
        var r=request("RESTING","ORIGINAL",start,null,null);
        var astronaut=astronauts.findById(subject).orElseThrow(); astronaut.setArchivedAt(Instant.now()); astronauts.flush();
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class).hasMessageContaining("archived");
    }

    @Test void syntheticObservationsCannotBecomePersonalBaselines() {
        UUID observation=observation("RESTING",true,subject,scope);
        var r=withEvidence(request("RESTING","ORIGINAL",start,null,null),List.of(observation));
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class).hasMessageContaining("Real");
    }

    @Test void anotherAstronautsEvidenceIsDenied() {
        UUID other=astronauts.saveAndFlush(new Astronaut("other-"+UUID.randomUUID(),"Other fixture")).getId();
        UUID observation=observation("RESTING",false,other,scope);
        var r=withEvidence(request("RESTING","ORIGINAL",start,null,null),List.of(observation));
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class);
    }

    @Test void mismatchingActivityEvidenceIsDenied() {
        UUID observation=observation("EXERCISING",false,subject,scope);
        var r=withEvidence(request("RESTING","ORIGINAL",start,null,null),List.of(observation));
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class);
    }

    @Test void incompatibleUnitIsRejected() {
        assertThatThrownBy(()->service.select(subject,"heart_rate","value","kg","RESTING",scope,start)).isInstanceOf(BaselineException.class);
    }

    @Test void muscleMassCannotUseGripOnlyEvidence() {
        UUID muscleScope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,"
                + "protocol_code,protocol_version) VALUES (?,'muscle','MUSCLE','DOMINANT_HAND','FIXTURE_PROTOCOL','1') RETURNING id",
                UUID.class,"test-muscle-"+UUID.randomUUID());
        UUID evidence=jdbc.queryForObject("INSERT INTO health_observations(astronaut_id,indicator_code,storage_kind,comparison_scope_id,"
                + "activity_context,measured_at,source_kind,source_name) VALUES (?,'muscle','MUSCLE',?,'RESTING',?,'CLINICAL','Fixture') RETURNING id",
                UUID.class,subject,muscleScope,Timestamp.from(input));
        jdbc.update("INSERT INTO muscle_assessments(observation_id,grip_strength_kgf) VALUES (?,10)",evidence);
        var r=new BaselineRequest("muscle","muscle_mass","kg","RESTING",muscleScope,"ORIGINAL",BigDecimal.TEN,
                start,null,input,input,"Fixture","Fixture",List.of(evidence),null,null);
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(BaselineException.class).hasMessageContaining("Real");
    }

    @Test void scopeIdentityCannotBeSubstitutedForEquivalentLookingProtocol() {
        UUID secondScope=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) "
                + "VALUES (?,'heart_rate','SCALAR') RETURNING id",UUID.class,"fixture-protocol-"+UUID.randomUUID());
        var r=request("RESTING","ORIGINAL",start,null,null);
        var mismatch=withEvidence(r,List.of(observation("RESTING",false,subject,secondScope)));
        assertThatThrownBy(()->service.propose(subject,mismatch)).isInstanceOf(BaselineException.class);
    }

    @Test void forgedRoleAuthoritiesCannotGrantBaselineWriteAccess() {
        Account astronaut=account(AccountRole.ASTRONAUT,subject);
        SecurityContextHolder.getContext().setAuthentication(org.springframework.security.authentication.UsernamePasswordAuthenticationToken
                .authenticated(new com.augustine.nasa_space_app_backend.security.AccountPrincipal(astronaut.getId()),null,
                        List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_NASA_OFFICER"))));
        var r=request("RESTING","ORIGINAL",start,null,null);
        assertThatThrownBy(()->service.propose(subject,r)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void syntheticScopeIsRejectedEvenWithoutSyntheticEvidence() {
        UUID synthetic=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind) "
                + "VALUES (?,'heart_rate','SCALAR') RETURNING id",UUID.class,"simulation-test-"+UUID.randomUUID());
        assertThatThrownBy(()->service.select(subject,"heart_rate","value","beats/min","RESTING",synthetic,start)).isInstanceOf(BaselineException.class);
    }

    @Test void radiationScopeBelongsToOneAstronaut() {
        UUID radiation=jdbc.queryForObject("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,"
                + "radiation_astronaut_id,accumulation_started_at,dosimetry_method) VALUES (?,'cumulative_absorbed_radiation_dose','SCALAR',"
                + "'WHOLE_BODY',?,?,'fixture method') RETURNING id",UUID.class,"test-"+UUID.randomUUID(),subject,Timestamp.from(input));
        UUID other=astronauts.saveAndFlush(new Astronaut("other-"+UUID.randomUUID(),"Other fixture")).getId();
        assertThatThrownBy(()->service.select(other,"cumulative_absorbed_radiation_dose","value","mGy","RESTING",radiation,start))
                .isInstanceOf(BaselineException.class);
    }

    @Test void valueMutationIsRejectedByDatabase() {
        UUID id=approve(request("RESTING","ORIGINAL",start,null,null));
        assertThatThrownBy(()->jdbc.update("UPDATE personal_baselines SET reference_value=99 WHERE id=?",id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void auditMutationIsRejectedByDatabase() {
        approve(request("RESTING","ORIGINAL",start,null,null));
        assertThatThrownBy(()->jdbc.update("UPDATE personal_baseline_approvals SET approval_note='changed' WHERE baseline_id IN "
                + "(SELECT id FROM personal_baselines WHERE astronaut_id=?)",subject))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void proposalDeletionIsRejectedByDatabase() {
        UUID id=service.propose(subject,request("RESTING","ORIGINAL",start,null,null));
        assertThatThrownBy(()->jdbc.update("DELETE FROM personal_baseline_proposals WHERE id=?",id))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private UUID approve(BaselineRequest r) {
        signIn(author); UUID proposal=service.propose(subject,r); signIn(approver);
        return service.approve(subject,proposal,"Fixture review only");
    }
    private PersonalBaselineService.Selection select(String context,Instant at) {
        return service.select(subject,"heart_rate","value","beats/min",context,scope,at);
    }
    private BaselineRequest request(String context,String kind,Instant from,UUID previous,String reason) {
        return new BaselineRequest("heart_rate","value","beats/min",context,scope,kind,new BigDecimal("10.123456"),
                from,null,input,input,"Fixture method","Test only",List.of(observation(context,false,subject,scope)),previous,reason);
    }
    private BaselineRequest withEvidence(BaselineRequest r,List<UUID> ids) {
        return new BaselineRequest(r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId(),r.baselineKind(),
                r.referenceValue(),r.effectiveFrom(),r.effectiveTo(),r.inputFrom(),r.inputTo(),r.method(),r.sourceName(),ids,
                r.supersedesBaselineId(),r.correctionReason());
    }
    private UUID observation(String context,boolean synthetic,UUID owner,UUID comparisonScope) {
        UUID id=jdbc.queryForObject("INSERT INTO health_observations (astronaut_id,indicator_code,storage_kind,comparison_scope_id,activity_context,"
                + "measured_at,source_kind,source_name,simulation_metadata) VALUES (?,'heart_rate','SCALAR',?,?,?,?, 'Test fixture',?::jsonb) RETURNING id",
                UUID.class,owner,comparisonScope,context,Timestamp.from(input),synthetic?"SIMULATION":"CLINICAL",synthetic?"{}":null);
        jdbc.update("INSERT INTO health_measurements(observation_id,indicator_code,value,unit) VALUES (?,'heart_rate',10.123456,'beats/min')",id);
        return id;
    }
    private Account account(AccountRole role,UUID profile) {
        return accounts.saveAndFlush(new Account("baseline."+UUID.randomUUID(),"$2a$12$"+"a".repeat(53),role,profile));
    }
    private void signIn(Account account) {
        var identity=new com.augustine.nasa_space_app_backend.dto.AccountIdentity(account.getId(),account.getLoginName(),account.getRole(),null);
        SecurityContextHolder.getContext().setAuthentication(AuthService.authenticationFor(identity));
    }
}
