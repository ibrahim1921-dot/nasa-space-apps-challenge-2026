package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import java.time.Instant;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Transactional
class SimulationIngestionTests extends SimulationIngestionTestSupport {
    private Fixture f;
    @BeforeEach void setup() throws Exception { f = fixture(); }

    @Test
    void completeEngineExportPersistsAllNineFamiliesTenShapesWithServerIdentityAndAuditMetadata() throws Exception {
        approveScopes(f);
        var page = page(f); page.set("items", f.original().get("items"));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(13)).andExpect(jsonPath("$.duplicates").value(0));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM health_observations WHERE astronaut_id=?", Integer.class, f.astronaut())).isEqualTo(13);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT indicator_code) FROM health_observations WHERE astronaut_id=?", Integer.class, f.astronaut())).isEqualTo(9);
        for (var expected : Map.of("health_measurements", 7, "blood_pressure_observations", 1, "sleep_sessions", 1,
                "mood_assessments", 1, "muscle_assessments", 2, "bone_density_examinations", 1).entrySet()) {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + expected.getKey() + " v JOIN health_observations o ON o.id=v.observation_id WHERE o.astronaut_id=?",
                    Integer.class, f.astronaut())).isEqualTo(expected.getValue());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM health_observations WHERE astronaut_id=? AND source_kind='SIMULATION' "
                + "AND provenance->>'demonstration_only'='true' AND simulation_metadata->>'capture_id'=? "
                + "AND simulation_metadata->>'workspace_id'=? AND jsonb_exists(provenance, 'original_simulation_envelope')", Integer.class,
                f.astronaut(), f.capture().toString(), f.workspace().toString())).isEqualTo(13);
        assertThat(jdbc.queryForObject("SELECT simulation_metadata->>'assessment_origin' FROM health_observations WHERE astronaut_id=? AND indicator_code='mood'",
                String.class, f.astronaut())).isEqualTo("SYNTHETIC_DEMONSTRATION_NOT_ASTRONAUT_SUBMISSION");
        assertThat(receipts.findByCaptureIdAndSourceRecordId(f.capture(), item(f, "heart_rate").get("envelope").get("observation").get("source_record_id").asText())).isPresent();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM personal_baselines WHERE astronaut_id=?", Integer.class, f.astronaut())).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM monitoring_rules WHERE astronaut_id=?", Integer.class, f.astronaut())).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings={"mood", "muscle:grip_strength", "muscle:muscle_mass", "bone_mineral_density", "cumulative_absorbed_radiation_dose"})
    void missingSpecializedScopeReturns422WithoutProvisioning(String code) throws Exception {
        long before = jdbc.queryForObject("SELECT COUNT(*) FROM measurement_comparison_scopes", Long.class);
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json")
                .content(bytes(page(f, item(f, code))))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("missing_scope")).andExpect(jsonPath("$.requiredScope.scope_code").isString());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM measurement_comparison_scopes", Long.class)).isEqualTo(before);
    }

    @Test
    void invalidUnitTimestampContextProjectionAndClientScopeUuidAre400() throws Exception {
        var original = item(f, "heart_rate");
        List<JsonNode> invalid = new ArrayList<>();
        ObjectNode unit = (ObjectNode) original.deepCopy(); values(unit).put("unit", "bpm"); invalid.add(unit);
        ObjectNode time = (ObjectNode) original.deepCopy(); observation(time).put("measured_at", "2026-01-01"); invalid.add(time);
        ObjectNode precision = (ObjectNode) original.deepCopy(); observation(precision).put("measured_at", "2026-01-01T08:15:00.0000001Z"); invalid.add(precision);
        ObjectNode beforeRun = (ObjectNode) original.deepCopy(); observation(beforeRun).put("measured_at", "2025-01-01T00:00:00Z"); invalid.add(beforeRun);
        ObjectNode context = (ObjectNode) original.deepCopy(); observation(context).put("activity_context", "ANY"); invalid.add(context);
        ObjectNode projection = (ObjectNode) original.deepCopy(); ((ObjectNode)projection.get("envelope")).remove("baseline_parameters"); invalid.add(projection);
        ObjectNode uuid = (ObjectNode) original.deepCopy(); observation(uuid).put("comparison_scope_id", UUID.randomUUID().toString()); invalid.add(uuid);
        ObjectNode mismatch = (ObjectNode) original.deepCopy(); values(mismatch).put("value", 999); invalid.add(mismatch);
        ObjectNode sql = (ObjectNode) original.deepCopy(); ((ObjectNode)sql.get("envelope")).put("value_table", "accounts"); invalid.add(sql);
        for (var bad : invalid) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json")
                    .content(bytes(page(f, bad)))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_observation"));
        }
    }

    @Test
    void scopeSubstitutionAndForgedSourceOrDestinationIdentifiersAreRejected() throws Exception {
        ObjectNode otherSource = (ObjectNode)item(f,"heart_rate"); observation(otherSource).put("astronaut_id", UUID.randomUUID().toString());
        ObjectNode otherCode = (ObjectNode)item(f,"heart_rate"); ((ObjectNode)otherCode.get("envelope")).put("crew_code", "sim-crew-99");
        for(var bad:List.of(otherSource,otherCode)) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,bad))))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("unapproved_profile"));
        }
        ObjectNode scope = (ObjectNode)item(f,"heart_rate"); ((ObjectNode)scope.get("envelope").get("comparison_scope")).put("scope_code", "other");
        ObjectNode destination = (ObjectNode)item(f,"heart_rate"); observation(destination).put("destination_astronaut_id", f.astronaut().toString());
        for(var bad:List.of(scope,destination)) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,bad))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void workspaceRunAndManifestIdentityMustMatchCapture() throws Exception {
        var wrongWorkspace = page(f,item(f,"heart_rate")); wrongWorkspace.put("workspace_id", UUID.randomUUID().toString());
        ObjectNode run = (ObjectNode)item(f,"heart_rate"); ((ObjectNode)observation(run).get("simulation_metadata")).put("run_id",UUID.randomUUID().toString());
        ObjectNode seed = (ObjectNode)item(f,"heart_rate"); ((ObjectNode)observation(seed).get("simulation_metadata")).put("seed",1);
        ObjectNode engine = (ObjectNode)item(f,"heart_rate"); ((ObjectNode)observation(engine).get("provenance")).put("engine_version","forged");
        for(var bad:List.of(wrongWorkspace,page(f,run),page(f,seed),page(f,engine))) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(bad)))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void anonymousAstronautMissingCsrfOtherOfficerAndDisabledOfficerAreRejected() throws Exception {
        byte[] body=bytes(page(f,item(f,"heart_rate")));
        mvc.perform(post(path(f)).with(csrf()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).contentType("application/json").content(body)).andExpect(status().isForbidden());
        var astronaut=accounts.saveAndFlush(new Account("ingest."+UUID.randomUUID(),HASH,AccountRole.ASTRONAUT,f.astronaut()));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(astronaut.getId()))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
        var other=accounts.saveAndFlush(new Account("ingest."+UUID.randomUUID(),HASH,AccountRole.NASA_OFFICER,null));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(other.getId()))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isNotFound());
        var officer=accounts.findById(f.officer()).orElseThrow(); officer.setEnabled(false); accounts.saveAndFlush(officer);
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
    }

    @Test
    void directServiceIgnoresForgedRoleAuthoritiesAndRequiresEnabledAccount() {
        var astronaut=accounts.saveAndFlush(new Account("ingest."+UUID.randomUUID(),HASH,AccountRole.ASTRONAUT,f.astronaut()));
        byte[] body=bytes(page(f,item(f,"heart_rate")));
        assertThatThrownBy(()->as(astronaut.getId(),()->ingestion.ingest(f.capture(),body)))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        SecurityContextHolder.clearContext();
        assertThatThrownBy(()->ingestion.ingest(f.capture(),body)).isInstanceOf(org.springframework.security.core.AuthenticationException.class);
    }

    @Test
    void archivedAstronautAndNewRecordsInClosedCaptureAreRejected() throws Exception {
        as(f.officer(),()->registration.close(f.capture(),f.workspace(),captures.findById(f.capture()).orElseThrow().getEngineRunId()));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json")
                .content(bytes(page(f,item(f,"heart_rate"))))).andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("capture_not_active"));
        var profile=astronauts.findById(f.astronaut()).orElseThrow(); profile.setArchivedAt(Instant.now()); astronauts.saveAndFlush(profile);
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json")
                .content(bytes(page(f,item(f,"heart_rate"))))).andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("astronaut_archived"));
    }

    @Test
    void identicalRetriesReturnOriginalAndRemainReadableAfterClose() throws Exception {
        byte[] body=bytes(page(f,item(f,"heart_rate")));
        var first=as(f.officer(),()->ingestion.ingest(f.capture(),body));
        var retry=as(f.officer(),()->ingestion.ingest(f.capture(),body));
        assertThat(first.created()).isEqualTo(1); assertThat(retry.duplicates()).isEqualTo(1);
        assertThat(retry.results().get(0).observationId()).isEqualTo(first.results().get(0).observationId());
        as(f.officer(),()->registration.close(f.capture(),f.workspace(),captures.findById(f.capture()).orElseThrow().getEngineRunId()));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(0)).andExpect(jsonPath("$.duplicates").value(1));
    }

    @Test
    void changedOriginalPayloadSequenceAndDuplicateExportIdentityConflict() throws Exception {
        JsonNode original=item(f,"heart_rate"); as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,original))));
        ObjectNode changed=(ObjectNode)original.deepCopy(); ((ObjectNode)observation(changed).get("simulation_metadata")).put("tick",99);
        ObjectNode sequence=(ObjectNode)original.deepCopy(); sequence.put("sequence",9999);
        ObjectNode identity=(ObjectNode)original.deepCopy(); observation(identity).put("source_record_id", UUID.randomUUID().toString());
        for(var bad:List.of(changed,sequence,identity)) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,bad))))
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("receipt_conflict"));
        }
    }

    @Test
    void radiationRejectsDecreasingEqualTimeAndOutOfOrderButAllowsExactRetries() throws Exception {
        approveScopes(f); var radiation=items(f,SimulationEnvelopeValidator.RADIATION);
        as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,radiation.get(1)))));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,radiation.get(0)))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("radiation_order_conflict"));
        ObjectNode decreasing=(ObjectNode)radiation.get(2).deepCopy(); values(decreasing).put("value",0);
        ((ObjectNode)decreasing.get("envelope").get("metrics").get(0)).put("value",0);
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,decreasing))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("radiation_order_conflict"));
        ObjectNode equalTime=(ObjectNode)radiation.get(2).deepCopy(); observation(equalTime).put("measured_at", observation(radiation.get(1)).get("measured_at").asText());
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(page(f,equalTime))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("radiation_order_conflict"));
        assertThat(as(f.officer(),()->ingestion.ingest(f.capture(),bytes(page(f,radiation.get(1))))).duplicates()).isEqualTo(1);
    }

    @Test
    void malformedUnknownOversizedAndDuplicateJsonFieldsAreRejected() throws Exception {
        byte[] valid=bytes(page(f,item(f,"heart_rate")));
        List<byte[]> invalid=List.of("{}".getBytes(), "{bad".getBytes(),
                (new String(valid, java.nio.charset.StandardCharsets.UTF_8)+" {}").getBytes(),
                "{\"schema_version\":\"a\",\"schema_version\":\"b\"}".getBytes(),
                bytes(page(f,item(f,"heart_rate"),item(f,"heart_rate"))));
        for(byte[] bad:invalid) mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bad))
                .andExpect(status().isBadRequest());
        var unknown=page(f,item(f,"heart_rate")); unknown.put("role","NASA_OFFICER");
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(bytes(unknown))).andExpect(status().isBadRequest());
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf()).contentType("application/json").content(new byte[SimulationPayload.MAX_BYTES+1]))
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void canonicalHashNormalizesNumbersObjectOrderButIncludesAllOriginalContent() {
        var a=SimulationPayload.parse("{\"z\":1.0,\"a\":[-0.0,1e2]}".getBytes());
        var b=SimulationPayload.parse("{\"a\":[0,100.000],\"z\":1}".getBytes());
        assertThat(SimulationPayload.canonical(a)).isEqualTo("{\"a\":[0,100],\"z\":1}").isEqualTo(SimulationPayload.canonical(b));
        assertThat(SimulationPayload.hash(a,"capture","workspace","mapping",1)).isEqualTo(SimulationPayload.hash(b,"capture","workspace","mapping",1));
        assertThat(SimulationPayload.hash(a,"capture","workspace","mapping",1)).isNotEqualTo(SimulationPayload.hash(b,"capture","workspace","mapping",2));
    }

    @Test
    void subtypeIntegrityFailuresAreRejectedBeforePersistence() throws Exception {
        List<JsonNode> bad = new ArrayList<>();
        var sleep = item(f, "sleep_hours"); values(sleep).put("ended_at", "2026-01-02T08:01:00Z"); bad.add(sleep);
        var seconds = item(f, "sleep_hours"); values(seconds).put("asleep_seconds", -1); bad.add(seconds);
        var mood = item(f, "mood"); values(mood).put("notes", "Astronaut submitted response"); bad.add(mood);
        var muscle = item(f, "muscle:grip_strength"); values(muscle).put("muscle_mass_kg", 28); bad.add(muscle);
        var negativeGrip = item(f, "muscle:grip_strength"); values(negativeGrip).put("grip_strength_kgf", -0.00001);
        ((ObjectNode)negativeGrip.get("envelope").get("metrics").get(0)).put("value", -0.00001); bad.add(negativeGrip);
        var bone = item(f, "bone_mineral_density"); values(bone).put("unit", "g/cm3"); bad.add(bone);
        var pressure = item(f, "blood_pressure"); values(pressure).put("systolic", -1);
        for (var metric : pressure.get("envelope").get("metrics")) {
            if (metric.get("metric_code").asText().equals("systolic")) ((ObjectNode)metric).put("value", -1);
        }
        bad.add(pressure);
        var radiation = item(f, SimulationEnvelopeValidator.RADIATION); values(radiation).put("value", -1);
        ((ObjectNode)radiation.get("envelope").get("metrics").get(0)).put("value", -1); bad.add(radiation);
        var unknown = item(f, "heart_rate"); observation(unknown).put("indicator_code", "oxygen"); bad.add(unknown);
        var storage = item(f, "heart_rate"); observation(storage).put("storage_kind", "BONE"); bad.add(storage);
        var numeric = item(f, "heart_rate"); values(numeric).put("value", "NaN"); bad.add(numeric);
        for (var invalid : bad) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf())
                    .contentType("application/json").content(bytes(page(f, invalid)))).andExpect(status().isBadRequest());
        }
    }

    @Test
    void incorrectlyConfiguredScopeIsAConflictRatherThanSilentFallback() throws Exception {
        insertScope(Map.of("scope_code", "simulation-mood-v1", "indicator_code", "mood", "storage_kind", "MOOD",
                "scale_name", "SYNTHETIC_DEMO_MOOD", "scale_version", "wrong-version", "scale_min", 1, "scale_max", 5));
        mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf())
                .contentType("application/json").content(bytes(page(f,item(f,"mood")))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("scope_definition_conflict"));
    }

    @Test
    void recordCountDepthAndExtremeNumericBoundsAreEnforced() throws Exception {
        var tooMany=page(f); var array=tooMany.putArray("items");
        for(int n=0;n<101;n++) array.add(item(f,"heart_rate"));
        String deep="{\"value\":"+"[".repeat(40)+"0"+"]".repeat(40)+"}";
        for(byte[] bad:List.of(bytes(tooMany), deep.getBytes(), "{\"number\":1e999999}".getBytes())) {
            mvc.perform(post(path(f)).with(authentication(officerAuthentication(f.officer()))).with(csrf())
                    .contentType("application/json").content(bad)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void numericSpellingObjectOrderAndPageCountersDoNotChangeReceiptIdentity() {
        var body=page(f,item(f,"heart_rate"));
        var first=as(f.officer(),()->ingestion.ingest(f.capture(),bytes(body)));
        ObjectNode retry=body.deepCopy(); retry.put("after",0); retry.put("through",99999);
        retry.put("retained_observations",99999); retry.put("next_url","/not-fetched");
        var metric=(ObjectNode)retry.get("items").get(0).get("envelope").get("metrics").get(0);
        metric.put("value", metric.get("value").decimalValue().setScale(12));
        values(retry.get("items").get(0)).put("value",metric.get("value").decimalValue());
        var result=as(f.officer(),()->ingestion.ingest(f.capture(),bytes(retry)));
        assertThat(result.duplicates()).isEqualTo(1);
        assertThat(result.results().get(0).observationId()).isEqualTo(first.results().get(0).observationId());
    }
    static ObjectNode observation(JsonNode item) { return (ObjectNode)item.get("envelope").get("observation"); }
    static ObjectNode values(JsonNode item) { return (ObjectNode)item.get("envelope").get("values"); }
}
