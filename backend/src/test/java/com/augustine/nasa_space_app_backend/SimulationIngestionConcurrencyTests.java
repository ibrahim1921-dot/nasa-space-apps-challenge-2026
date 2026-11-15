package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Committed/failed transactions in per-test schemas inside the disposable test container. */
class SimulationIngestionConcurrencyTests extends SimulationIngestionTestSupport {
    @Autowired Environment environment;
    @Autowired PlatformTransactionManager transactions;
    private String schema;
    private JdbcTemplate fixtureJdbc;
    private Fixture f;

    @BeforeEach void setupSchema() {
        String url=environment.getRequiredProperty("spring.datasource.url");
        String user=environment.getRequiredProperty("spring.datasource.username");
        String password=environment.getRequiredProperty("spring.datasource.password");
        schema="ingestion_"+UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(url,user,password).defaultSchema(schema).schemas(schema)
                .locations("classpath:db/migration").cleanDisabled(true).load().migrate();
        fixtureJdbc=new JdbcTemplate(new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"currentSchema="+schema,user,password));
        f=inSchema(this::fixture);
    }

    @Test
    void missingScopeAfterFirstInsertRollsBackEntireBatchAndReceipts() {
        byte[] body=bytes(page(f,item(f,"heart_rate"),item(f,"mood")));
        assertThatThrownBy(()->inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),body))))
                .isInstanceOf(SimulationIngestionException.class).hasMessage("missing_scope");
        assertEmpty();
        assertThat(inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,item(f,"heart_rate")))))).created()).isEqualTo(1);
    }

    @Test
    void receiptConflictAfterFirstNewRecordRollsBackOnlyNewBatchInserts() {
        var hearts=items(f,"heart_rate");
        inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,hearts.get(1))))));
        var changed=(tools.jackson.databind.node.ObjectNode)hearts.get(1).deepCopy();
        ((tools.jackson.databind.node.ObjectNode)changed.get("envelope").get("observation").get("simulation_metadata")).put("tick",99);
        assertThatThrownBy(()->inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,hearts.get(0),changed))))))
                .isInstanceOf(SimulationIngestionException.class).hasMessage("receipt_conflict");
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM health_observations",Integer.class)).isEqualTo(1);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_ingestion_receipts",Integer.class)).isEqualTo(1);
    }

    @Test
    void simultaneousDuplicateBatchesCommitExactlyOneHeaderValueAndReceipt() throws Exception {
        byte[] body=bytes(page(f,item(f,"heart_rate")));
        var pool=Executors.newFixedThreadPool(2); var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try {
            Callable<SimulationIngestionResponse> call=()->{
                ready.countDown(); if(!start.await(10,TimeUnit.SECONDS)) throw new AssertionError("Race did not start");
                return inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),body)));
            };
            var a=pool.submit(call); var b=pool.submit(call);
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); start.countDown();
            var first=a.get(30,TimeUnit.SECONDS); var second=b.get(30,TimeUnit.SECONDS);
            assertThat(first.created()+second.created()).isEqualTo(1); assertThat(first.duplicates()+second.duplicates()).isEqualTo(1);
            assertThat(first.results().get(0).observationId()).isEqualTo(second.results().get(0).observationId());
            for(String table:List.of("health_observations","health_measurements","simulation_ingestion_receipts")) {
                assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class)).isEqualTo(1);
            }
        } finally { start.countDown(); pool.shutdownNow(); }
    }

    @Test
    void separateCapturesHaveIndependentRadiationOriginsAndRequireSeparateApproval() {
        inSchema(()->{ approveScopes(f); return null; });
        var radiation=items(f,SimulationEnvelopeValidator.RADIATION);
        inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,radiation.get(2))))));
        UUID other=inSchema(()->as(f.officer(),()->{
            var manifest=json.treeToValue(f.original().get("manifest"),CaptureRegistrationRequest.RunManifest.class);
            var mapping=mappings.findAllByCaptureId(f.capture()).get(0);
            return registration.register(new CaptureRegistrationRequest(UUID.randomUUID(),f.workspace(),manifest.runId(),manifest,
                    List.of(new CaptureRegistrationRequest.ProfileMapping(mapping.getSimulationAstronautId(),mapping.getSimulationCrewCode(),mapping.getTargetCrewCode()))))
                    .capture().captureId();
        }));
        Fixture independent=new Fixture(f.officer(),f.astronaut(),other,f.workspace(),f.original());
        assertThatThrownBy(()->inSchema(()->as(f.officer(),()->ingestion.ingest(other,bytes(page(independent,radiation.get(0)))))))
                .isInstanceOf(SimulationIngestionException.class).hasMessage("missing_scope");
        inSchema(()->{ approveScopes(independent); return null; });
        assertThat(inSchema(()->as(f.officer(),()->ingestion.ingest(other,bytes(page(independent,radiation.get(0)))))).created()).isEqualTo(1);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(DISTINCT comparison_scope_id) FROM health_observations WHERE indicator_code=?",Integer.class,SimulationEnvelopeValidator.RADIATION)).isEqualTo(2);
    }

    @Test
    void allNineFamiliesCommitWithTheirCompleteSubtypeRowsAndDurableReceipts() {
        inSchema(()->{ approveScopes(f); return null; });
        var body=page(f); body.set("items",f.original().get("items"));
        var result=inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(body))));
        assertThat(result.created()).isEqualTo(13);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(DISTINCT indicator_code) FROM health_observations",Integer.class)).isEqualTo(9);
        assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM simulation_ingestion_receipts",Integer.class)).isEqualTo(13);
        assertThat(inSchema(()->as(f.officer(),()->ingestion.ingest(f.capture(),bytes(body)))).duplicates()).isEqualTo(13);
    }

    private void assertEmpty() {
        for(String table:List.of("health_observations","health_measurements","simulation_ingestion_receipts"))
            assertThat(fixtureJdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class)).isZero();
    }
    private <T> T inSchema(Callable<T> action) {
        return new TransactionTemplate(transactions).execute(status->{
            jdbc.execute("SET LOCAL search_path TO "+schema); // Locally generated UUID-based schema; reset at transaction end.
            try { return action.call(); }
            catch(RuntimeException exception) { throw exception; }
            catch(Exception exception) { throw new IllegalStateException(exception); }
        });
    }
}
