package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.*;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import jakarta.validation.Validator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

@Service
@Transactional
public class PersonalBaselineService {
    private final JdbcTemplate jdbc;
    private final AuthService auth;
    private final AccountRepository accounts;
    private final AstronautService astronauts;
    private final Validator validator;
    private final ObjectMapper json;
    private final Clock clock;

    public PersonalBaselineService(JdbcTemplate jdbc, AuthService auth, AccountRepository accounts,
            AstronautService astronauts, Validator validator, ObjectMapper json, Clock clock) {
        this.jdbc = jdbc; this.auth = auth; this.accounts = accounts; this.astronauts = astronauts;
        this.validator = validator; this.json = json; this.clock = clock;
    }

    public UUID propose(UUID astronautId, BaselineRequest request) {
        AccountIdentity actor = access(astronautId, true);
        validate(astronautId, request);
        return jdbc.queryForObject("INSERT INTO personal_baseline_proposals (astronaut_id,created_by,request) "
                + "VALUES (?,?,?::jsonb) RETURNING id", UUID.class, astronautId, actor.accountId(), json.writeValueAsString(request));
    }

    public UUID approve(UUID astronautId, UUID proposalId, String note) {
        AccountIdentity actor = access(astronautId, true);
        if (note == null || note.isBlank() || note.length() > 2000) throw invalid();
        var proposals = jdbc.queryForList("SELECT * FROM personal_baseline_proposals WHERE id=? AND astronaut_id=?", proposalId, astronautId);
        if (proposals.isEmpty()) throw new BaselineException(404, "Baseline proposal not found.");
        var proposal = proposals.get(0);
        if (actor.accountId().equals(proposal.get("created_by"))) throw new AccessDeniedException("Independent officer approval is required.");
        var existing = jdbc.queryForList("SELECT baseline_id FROM personal_baseline_approvals WHERE proposal_id=?", proposalId);
        if (!existing.isEmpty()) return (UUID) existing.get(0).get("baseline_id");
        BaselineRequest r = json.readValue(proposal.get("request").toString(), BaselineRequest.class);
        validate(astronautId, r); // Revalidate evidence and effective time at approval, never trust a stale proposal.
        var series = jdbc.queryForList("SELECT * FROM personal_baselines WHERE astronaut_id=? AND indicator_code=? "
                + "AND metric_code=? AND activity_context=? AND comparison_scope_id=? AND baseline_kind=? ORDER BY version DESC",
                astronautId, r.indicatorCode(), r.metricCode(), r.activityContext(), r.comparisonScopeId(), r.baselineKind());
        int version = 1;
        if (!series.isEmpty()) {
            var previous = series.get(0);
            if (!previous.get("id").equals(r.supersedesBaselineId())) throw conflict();
            Instant start = ((Timestamp) previous.get("effective_from")).toInstant();
            if (!r.effectiveFrom().isAfter(start)) throw conflict();
            Timestamp end = (Timestamp) previous.get("effective_to");
            if (end == null) {
                // Changes are prospective, preserving every previously available comparison.
                jdbc.update("UPDATE personal_baselines SET effective_to=? WHERE id=?", ts(r.effectiveFrom()), r.supersedesBaselineId());
            } else if (end.toInstant().isAfter(r.effectiveFrom())) throw conflict();
            version = ((Number) previous.get("version")).intValue() + 1;
        } else if (r.supersedesBaselineId() != null) throw conflict();
        String provenance = json.writeValueAsString(Map.of("proposal_id", proposalId, "source_type", "REAL_OBSERVATIONS",
                "observation_ids", r.observationIds(), "created_by", proposal.get("created_by")));
        UUID id = jdbc.queryForObject("INSERT INTO personal_baselines (astronaut_id,indicator_code,metric_code,unit,activity_context,"
                + "comparison_scope_id,baseline_kind,version,reference_value,effective_from,effective_to,input_from,input_to,"
                + "sample_count,method,source_name,provenance,supersedes_baseline_id,correction_reason) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING id", UUID.class,
                astronautId,r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId(),r.baselineKind(),version,
                r.referenceValue(),ts(r.effectiveFrom()),ts(r.effectiveTo()),ts(r.inputFrom()),ts(r.inputTo()),r.observationIds().size(),
                r.method(),r.sourceName(),provenance,r.supersedesBaselineId(),r.correctionReason());
        jdbc.update("INSERT INTO personal_baseline_approvals (proposal_id,baseline_id,approved_by,approval_note) VALUES (?,?,?,?)",
                proposalId,id,actor.accountId(),note);
        return id;
    }

    public List<Map<String,Object>> history(UUID astronautId) {
        access(astronautId, false);
        // Includes pending proposals and original request snapshots even after validity closure.
        return jdbc.queryForList("SELECT p.id AS proposal_id,p.request::text AS request,p.created_by,p.created_at,"
                + "a.baseline_id,a.approved_by,a.approved_at,a.approval_note,b.version,b.effective_to "
                + "FROM personal_baseline_proposals p LEFT JOIN personal_baseline_approvals a ON a.proposal_id=p.id "
                + "LEFT JOIN personal_baselines b ON b.id=a.baseline_id WHERE p.astronaut_id=? ORDER BY p.created_at,p.id", astronautId);
    }

    public List<Map<String,Object>> versions(UUID astronautId) {
        access(astronautId, false);
        // Retain visibility of legacy rows without treating them as approved.
        return jdbc.queryForList("SELECT b.id,b.indicator_code,b.metric_code,b.unit,b.activity_context,b.comparison_scope_id,"
                + "b.baseline_kind,b.version,b.reference_value,b.lower_bound,b.upper_bound,b.effective_from,b.effective_to,"
                + "b.input_from,b.input_to,b.sample_count,b.method,b.source_name,b.provenance::text AS provenance,b.created_at,"
                + "b.supersedes_baseline_id,b.correction_reason,a.proposal_id,a.approved_by,a.approved_at,a.approval_note "
                + "FROM personal_baselines b LEFT JOIN personal_baseline_approvals a ON a.baseline_id=b.id "
                + "WHERE b.astronaut_id=? ORDER BY b.created_at,b.id",astronautId);
    }

    public record Selection(String status, UUID baselineId, String baselineKind, Integer version,
                            java.math.BigDecimal referenceValue, String unit) { }

    public Selection select(UUID astronautId, String indicator, String metric, String unit, String context, UUID scope, Instant at) {
        access(astronautId, false);
        return selectForEvaluation(astronautId,indicator,metric,unit,context,scope,at);
    }
    // Package-private trusted evaluation path; public selection retains authentication/ownership checks.
    @Transactional(readOnly=true,noRollbackFor=BaselineException.class)
    Selection selectForEvaluation(UUID astronautId, String indicator, String metric, String unit, String context, UUID scope, Instant at) {
        dimensions(astronautId,indicator,metric,unit,context,scope);
        finite(at);
        var rows = jdbc.queryForList("SELECT b.* FROM personal_baselines b JOIN personal_baseline_approvals a ON a.baseline_id=b.id "
                + "WHERE b.astronaut_id=? AND b.indicator_code=? AND b.metric_code=? AND b.unit=? AND b.activity_context=? "
                + "AND b.comparison_scope_id=? AND b.effective_from<=? AND (b.effective_to IS NULL OR b.effective_to>?) "
                + "ORDER BY CASE b.baseline_kind WHEN 'ROLLING' THEN 0 ELSE 1 END",
                astronautId,indicator,metric,unit,context,scope,ts(at),ts(at));
        if (rows.isEmpty()) return new Selection("MISSING",null,null,null,null,unit);
        var first = rows.get(0);
        if (rows.stream().filter(row -> row.get("baseline_kind").equals(first.get("baseline_kind"))).count() > 1) throw conflict();
        return new Selection("SELECTED",(UUID) first.get("id"),(String) first.get("baseline_kind"),
                ((Number) first.get("version")).intValue(),(java.math.BigDecimal) first.get("reference_value"),(String) first.get("unit"));
    }

    private AccountIdentity access(UUID astronautId, boolean write) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) {
            throw new AuthenticationCredentialsNotFoundException("Authentication is required.");
        }
        if (write) accounts.findLockedById(principal.accountId()).orElseThrow(() -> new AccessDeniedException("Account unavailable."));
        AccountIdentity identity = auth.currentIdentity(principal.accountId());
        if (write && identity.role() != AccountRole.NASA_OFFICER) throw new AccessDeniedException("NASA officer access is required.");
        astronauts.getAstronautById(astronautId); // Reload authorization, including owner and current enabled/archive status.
        if (write) {
            var active = jdbc.queryForList("SELECT id FROM astronauts WHERE id=? AND archived_at IS NULL FOR UPDATE", astronautId);
            if (active.isEmpty()) throw new BaselineException(409,"Astronaut is archived.");
        }
        return identity;
    }

    private void validate(UUID astronautId, BaselineRequest r) {
        if (r == null || !validator.validate(r).isEmpty()) throw invalid();
        dimensions(astronautId,r.indicatorCode(),r.metricCode(),r.unit(),r.activityContext(),r.comparisonScopeId());
        // Match existing storage-domain constraints; these are not clinical limits.
        int sign = r.referenceValue().signum();
        if ((Set.of("blood_pressure","bone_mineral_density").contains(r.indicatorCode()) && sign <= 0)
                || (Set.of("sleep_hours","muscle","cumulative_absorbed_radiation_dose").contains(r.indicatorCode()) && sign < 0)
                || ("muscle_mass".equals(r.metricCode()) && sign == 0)) throw invalid();
        if ("mood".equals(r.indicatorCode()) && Boolean.FALSE.equals(jdbc.queryForObject(
                "SELECT ? BETWEEN scale_min AND scale_max FROM measurement_comparison_scopes WHERE id=?",
                Boolean.class,r.referenceValue(),r.comparisonScopeId()))) throw invalid();
        finite(r.effectiveFrom()); finite(r.inputFrom()); finite(r.inputTo());
        if (r.effectiveTo() != null) { finite(r.effectiveTo()); if (!r.effectiveTo().isAfter(r.effectiveFrom())) throw invalid(); }
        if (r.effectiveFrom().isBefore(clock.instant()) || r.inputTo().isAfter(r.effectiveFrom())
                || r.inputTo().isBefore(r.inputFrom()) || r.inputTo().isAfter(clock.instant())
                || new HashSet<>(r.observationIds()).size() != r.observationIds().size()
                || (r.supersedesBaselineId() == null) != (r.correctionReason() == null)
                || (r.correctionReason() != null && r.correctionReason().isBlank())) throw invalid();
        for (UUID id : r.observationIds()) {
            Integer matches = jdbc.queryForObject("SELECT count(*) FROM health_observations o WHERE o.id=? AND o.astronaut_id=? "
                    + "AND o.indicator_code=? AND o.comparison_scope_id=? AND o.activity_context=? AND o.source_kind<>'SIMULATION' "
                    + "AND o.simulation_metadata IS NULL AND o.measured_at>=? AND o.measured_at<=? "
                    + "AND (o.provenance::text || o.source_name) !~* '(simulation|synthetic)' "
                    + "AND NOT EXISTS (SELECT 1 FROM health_observations c WHERE c.supersedes_observation_id=o.id) "
                    + "AND NOT EXISTS (SELECT 1 FROM astronaut_checkins c WHERE c.id=o.checkin_id AND c.is_simulated) "
                    + "AND " + metricEvidence(r.metricCode(), r.indicatorCode()), Integer.class,
                    id,astronautId,r.indicatorCode(),r.comparisonScopeId(),r.activityContext(),ts(r.inputFrom()),ts(r.inputTo()));
            if (matches == null || matches != 1) throw new BaselineException(400,"Real, current observations matching the baseline dimensions are required.");
        }
    }

    private void dimensions(UUID astronautId, String indicator, String metric, String unit, String context, UUID scope) {
        Integer matches = jdbc.queryForObject("SELECT count(*) FROM measurement_comparison_scopes s "
                + "JOIN indicator_metrics m ON m.indicator_code=s.indicator_code "
                + "JOIN indicator_contexts c ON c.indicator_code=s.indicator_code "
                + "WHERE s.id=? AND s.indicator_code=? AND m.metric_code=? AND m.unit=? AND c.activity_context=? "
                + "AND (s.radiation_astronaut_id IS NULL OR s.radiation_astronaut_id=?) "
                + "AND to_jsonb(s)::text !~* '(simulation|synthetic)' "
                + "AND NOT EXISTS (SELECT 1 FROM simulation_scope_provisioning_audit a WHERE a.scope_id=s.id)",
                Integer.class,scope,indicator,metric,unit,context,astronautId);
        if (matches == null || matches != 1) throw new BaselineException(400,"Invalid unit, metric, activity context or real comparison scope.");
    }

    private String metricEvidence(String metric, String indicator) {
        return switch (indicator) {
            case "muscle" -> "EXISTS (SELECT 1 FROM muscle_assessments v WHERE v.observation_id=o.id AND "
                    + ("grip_strength".equals(metric) ? "v.grip_strength_kgf" : "v.muscle_mass_kg") + " IS NOT NULL)";
            case "blood_pressure" -> "EXISTS (SELECT 1 FROM blood_pressure_observations v WHERE v.observation_id=o.id)";
            case "sleep_hours" -> "EXISTS (SELECT 1 FROM sleep_sessions v WHERE v.observation_id=o.id)";
            case "mood" -> "EXISTS (SELECT 1 FROM mood_assessments v WHERE v.observation_id=o.id)";
            case "bone_mineral_density" -> "EXISTS (SELECT 1 FROM bone_density_examinations v WHERE v.observation_id=o.id)";
            default -> "EXISTS (SELECT 1 FROM health_measurements v WHERE v.observation_id=o.id)";
        };
    }

    private static void finite(Instant at) {
        if (at == null || at.isBefore(Instant.parse("0001-01-01T00:00:00Z")) || at.isAfter(Instant.parse("9999-12-31T23:59:59Z"))
                || at.getNano() % 1000 != 0) throw invalid();
    }
    private static Timestamp ts(Instant at) { return at == null ? null : Timestamp.from(at); }
    private static BaselineException invalid() { return new BaselineException(400,"Invalid baseline proposal."); }
    private static BaselineException conflict() { return new BaselineException(409,"Conflicting baseline version or effective period."); }
}
