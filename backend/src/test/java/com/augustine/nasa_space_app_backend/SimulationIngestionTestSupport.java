package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.dto.CaptureRegistrationRequest;
import com.augustine.nasa_space_app_backend.entity.*;
import com.augustine.nasa_space_app_backend.repository.*;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import com.augustine.nasa_space_app_backend.service.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
        "astrohealth.environment=development", "astrohealth.simulation.capture-registration-enabled=true"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
abstract class SimulationIngestionTestSupport extends PostgreSqlIntegrationTest {
    static final String HASH = "$2a$12$" + "a".repeat(53);
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountRepository accounts;
    @Autowired AstronautRepository astronauts;
    @Autowired SimulationCaptureRepository captures;
    @Autowired SimulationProfileMappingRepository mappings;
    @Autowired SimulationIngestionReceiptRepository receipts;
    @Autowired SimulationCaptureService registration;
    @Autowired SimulationIngestionService ingestion;
    @Autowired SimulationScopeResolver scopes;
    @Autowired SimulationEnvelopeValidator validator;

    Fixture fixture() throws Exception {
        JsonNode original;
        try (var input = getClass().getResourceAsStream("/simulation/engine-observations-v1.json")) {
            original = SimulationPayload.parse(Objects.requireNonNull(input).readAllBytes());
        }
        var destination = astronauts.saveAndFlush(new Astronaut("crew-01", "Disposable synthetic ingestion profile"));
        var officer = accounts.saveAndFlush(new Account("ingest." + UUID.randomUUID(), HASH, AccountRole.NASA_OFFICER, null));
        JsonNode profile = original.get("manifest").get("configuration").get("profiles").get(0);
        UUID source = UUID.fromString(profile.get("astronaut_id").asText());
        String crew = profile.get("crew_code").asText();
        UUID workspace = UUID.randomUUID();
        var manifest = json.treeToValue(original.get("manifest"), CaptureRegistrationRequest.RunManifest.class);
        var request = new CaptureRegistrationRequest(UUID.randomUUID(), workspace, manifest.runId(), manifest,
                List.of(new CaptureRegistrationRequest.ProfileMapping(source, crew, "crew-01")));
        UUID capture = as(officer.getId(), () -> registration.register(request).capture().captureId());
        return new Fixture(officer.getId(), destination.getId(), capture, workspace, original);
    }

    ObjectNode page(Fixture f, JsonNode... items) {
        var page = json.createObjectNode();
        page.put("schema_version", "astrohealth.simulation.export.v1"); page.put("synthetic", true);
        page.put("workspace_id", f.workspace().toString());
        var array = page.putArray("items"); for (var item : items) array.add(item);
        return page;
    }
    JsonNode item(Fixture f, String code) {
        for (var item : f.original().get("items")) {
            String indicator = item.get("envelope").get("observation").get("indicator_code").asText();
            String metric = item.get("envelope").get("metrics").get(0).get("metric_code").asText();
            if (indicator.equals(code) || (indicator + ":" + metric).equals(code)) return item.deepCopy();
        }
        throw new AssertionError("Missing engine fixture: " + code);
    }
    List<JsonNode> items(Fixture f, String code) {
        List<JsonNode> result = new ArrayList<>();
        for (var item : f.original().get("items")) {
            if (item.get("envelope").get("observation").get("indicator_code").asText().equals(code)) result.add(item.deepCopy());
        }
        return result;
    }
    byte[] bytes(JsonNode node) { return json.writeValueAsBytes(node); }
    String path(Fixture f) { return "/api/simulation/captures/" + f.capture() + "/observations"; }
    Authentication officerAuthentication(UUID account) {
        return UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(account), null,
                List.of(new SimpleGrantedAuthority("ROLE_NASA_OFFICER")));
    }
    <T> T as(UUID account, Supplier<T> action) {
        var old = SecurityContextHolder.getContext();
        var context = SecurityContextHolder.createEmptyContext(); context.setAuthentication(officerAuthentication(account));
        SecurityContextHolder.setContext(context);
        try { return action.get(); } finally { SecurityContextHolder.setContext(old); }
    }
    void approveScopes(Fixture f) {
        var capture = captures.findById(f.capture()).orElseThrow();
        var mapping = mappings.findAllByCaptureId(f.capture()).get(0);
        for (var item : f.original().get("items")) {
            try { scopes.resolve(validator.validate(item.get("envelope")), capture, mapping); }
            catch (SimulationIngestionException exception) {
                if (!exception.code().equals("missing_scope")) throw exception;
                insertScope(exception.requiredScope());
            }
        }
    }
    void insertScope(Map<String, Object> scope) {
        // Explicit test fixtures only. Production ingestion never performs this insertion.
        jdbc.update("INSERT INTO measurement_comparison_scopes(scope_code,indicator_code,storage_kind,body_site,protocol_code,protocol_version,"
                + "scale_name,scale_version,scale_min,scale_max,radiation_astronaut_id,accumulation_started_at,dosimetry_method) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                scope.get("scope_code"), scope.get("indicator_code"), scope.get("storage_kind"), scope.get("body_site"), scope.get("protocol_code"), scope.get("protocol_version"),
                scope.get("scale_name"), scope.get("scale_version"), scope.get("scale_min"), scope.get("scale_max"),
                scope.containsKey("radiation_astronaut_id") ? UUID.fromString(scope.get("radiation_astronaut_id").toString()) : null,
                scope.containsKey("accumulation_started_at") ? Timestamp.from(Instant.parse(scope.get("accumulation_started_at").toString())) : null, scope.get("dosimetry_method"));
    }
    record Fixture(UUID officer, UUID astronaut, UUID capture, UUID workspace, JsonNode original) { }
}
