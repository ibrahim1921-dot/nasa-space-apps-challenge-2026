package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
@Transactional
public class AstronautAssessmentService {
    private final JdbcTemplate jdbc;
    private final AuthService auth;
    private final AccountRepository accounts;
    private final AstronautService astronauts;
    private final ObjectMapper json;
    private final ObservationEvaluationOutbox evaluations;

    public AstronautAssessmentService(JdbcTemplate jdbc, AuthService auth, AccountRepository accounts,
            AstronautService astronauts, ObjectMapper json, ObservationEvaluationOutbox evaluations) {
        this.jdbc=jdbc; this.auth=auth; this.accounts=accounts; this.astronauts=astronauts; this.json=json;
        this.evaluations=evaluations;
    }

    public Saved submit(UUID astronautId,String kind,UUID key,JsonNode body) {
        AccountIdentity actor=access(astronautId,true);
        if(key==null) throw AssessmentPayloads.invalid();
        Instant at=AssessmentPayloads.validate(kind,body);
        // Locking the profile serializes retries, including concurrent submissions
        // from separate sessions; the database uniqueness constraint is a backstop.
        String request=json.writeValueAsString(body);
        var existing=jdbc.queryForList("SELECT id,request=?::jsonb AS same FROM astronaut_assessment_submissions "
                + "WHERE astronaut_id=? AND kind=? AND idempotency_key=?",request,astronautId,kind,key);
        if(!existing.isEmpty()) {
            if(!Boolean.TRUE.equals(existing.get(0).get("same")))
                throw new AssessmentProblem(409,"Idempotency key was already used with different assessment data.");
            return new Saved(getInternal(astronautId,kind,(UUID)existing.get(0).get("id")),false);
        }
        UUID id=UUID.randomUUID();
        String source=switch(kind) {case "CHECKIN" -> "daily-checkin-v1"; case "SLEEP_LOG" -> "sleep-log-v1"; default -> "stand-test-v1";};
        String provenance=json.writeValueAsString(Map.of("entry_method","MANUAL_ENTRY","form_version",1,
                "actor_account_id",actor.accountId(),"measurement_verification","NOT_DEVICE_VERIFIED"));
        UUID checkin=null;
        if(kind.equals("CHECKIN")) {
            checkin=jdbc.queryForObject("INSERT INTO astronaut_checkins (astronaut_id,reported_at,notes,idempotency_key,source_name,provenance) "
                    + "VALUES (?,?,?,?,?,?::jsonb) RETURNING id",UUID.class,astronautId,Timestamp.from(at),
                    body.get("context").get("notes").asText(),"assessment:"+key,source,provenance);
        }
        jdbc.update("INSERT INTO astronaut_assessment_submissions "
                + "(id,astronaut_id,kind,idempotency_key,recorded_at,created_by,source_name,request,provenance,checkin_id) "
                + "VALUES (?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)",id,astronautId,kind,key,Timestamp.from(at),actor.accountId(),source,request,provenance,checkin);
        if(kind.equals("CHECKIN")) projectCheckin(id,astronautId,checkin,at,body.get("reading"),provenance);
        return new Saved(getInternal(astronautId,kind,id),true);
    }

    @Transactional(readOnly=true)
    public Submission get(UUID astronautId,String kind,UUID id) {
        access(astronautId,false); return getInternal(astronautId,kind,id);
    }

    @Transactional(readOnly=true)
    public History history(UUID astronautId,String kind,int limit,UUID before) {
        access(astronautId,false);
        if(limit<1 || limit>100) throw AssessmentPayloads.invalid();
        List<Map<String,Object>> rows;
        if(before==null) rows=jdbc.queryForList("SELECT * FROM astronaut_assessment_submissions "
                + "WHERE astronaut_id=? AND kind=? ORDER BY recorded_at DESC,id DESC LIMIT ?",astronautId,kind,limit+1);
        else {
            var cursor=jdbc.queryForList("SELECT recorded_at,id FROM astronaut_assessment_submissions WHERE astronaut_id=? AND kind=? AND id=?",
                    astronautId,kind,before);
            if(cursor.isEmpty()) throw new AssessmentProblem(400,"Invalid assessment history cursor.");
            rows=jdbc.queryForList("SELECT * FROM astronaut_assessment_submissions WHERE astronaut_id=? AND kind=? "
                    + "AND (recorded_at,id)<(?,?) ORDER BY recorded_at DESC,id DESC LIMIT ?",
                    astronautId,kind,cursor.get(0).get("recorded_at"),before,limit+1);
        }
        boolean more=rows.size()>limit;
        var items=rows.stream().limit(limit).map(this::response).toList();
        return new History(items,more?items.get(items.size()-1).id():null);
    }

    private AccountIdentity access(UUID astronautId,boolean write) {
        var authentication=SecurityContextHolder.getContext().getAuthentication();
        if(authentication==null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AccountPrincipal principal))
            throw new AuthenticationCredentialsNotFoundException("Authentication is required.");
        if(write) accounts.findLockedById(principal.accountId()).orElseThrow(()->new AccessDeniedException("Account unavailable."));
        AccountIdentity identity=auth.currentIdentity(principal.accountId());
        if(write && identity.role()!=AccountRole.ASTRONAUT) throw new AccessDeniedException("Astronaut submission is required.");
        astronauts.getAstronautById(astronautId); // Enforces ownership and reloads account/profile status.
        if(write && jdbc.queryForList("SELECT id FROM astronauts WHERE id=? AND archived_at IS NULL FOR UPDATE",astronautId).isEmpty())
            throw new AccessDeniedException("Active astronaut profile is required.");
        return identity;
    }
    private Submission getInternal(UUID astronautId,String kind,UUID id) {
        var rows=jdbc.queryForList("SELECT * FROM astronaut_assessment_submissions WHERE astronaut_id=? AND kind=? AND id=?",astronautId,kind,id);
        if(rows.isEmpty()) throw new AssessmentProblem(404,"Assessment not found.");
        return response(rows.get(0));
    }
    private Submission response(Map<String,Object> r) {
        UUID id=(UUID)r.get("id");
        var observations=jdbc.queryForList("SELECT observation_id FROM astronaut_assessment_observations WHERE submission_id=? ORDER BY observation_id",UUID.class,id);
        return new Submission(id,(UUID)r.get("astronaut_id"),(String)r.get("kind"),1,
                ((Timestamp)r.get("recorded_at")).toInstant(),((Timestamp)r.get("ingested_at")).toInstant(),
                "SELF_REPORT",(String)r.get("source_name"),json.readTree(r.get("request").toString()),
                json.readTree(r.get("provenance").toString()),observations);
    }
    private void projectCheckin(UUID submission,UUID astronaut,UUID checkin,Instant at,JsonNode r,String provenance) {
        // Register only when this form is actually submitted. Migrations must not
        // seed protocol/scale scopes or affect independent simulation provisioning.
        jdbc.update("INSERT INTO measurement_comparison_scopes "
                + "(scope_code,indicator_code,storage_kind,scale_name,scale_version,scale_min,scale_max) "
                + "VALUES ('main-frontend-mood-v1','mood','MOOD','Main frontend mood self-report','1',1,5) "
                + "ON CONFLICT (indicator_code,scope_code) DO NOTHING");
        if(jdbc.queryForObject("SELECT count(*) FROM measurement_comparison_scopes WHERE scope_code='main-frontend-mood-v1' "
                + "AND indicator_code='mood' AND storage_kind='MOOD' AND scale_name='Main frontend mood self-report' "
                + "AND scale_version='1' AND scale_min=1 AND scale_max=5",Integer.class)!=1)
            throw new AssessmentProblem(409,"The retained mood scale conflicts with this form version.");
        UUID bp=observation(submission,astronaut,checkin,at,"blood_pressure","BLOOD_PRESSURE","default",provenance);
        jdbc.update("INSERT INTO blood_pressure_observations (observation_id,systolic,diastolic) VALUES (?,?,?)",bp,
                r.get("systolic").decimalValue(),r.get("diastolic").decimalValue());
        scalar(submission,astronaut,checkin,at,"heart_rate",r.get("heart_rate").decimalValue(),"beats/min",provenance);
        // Raw mg/dL remains losslessly retained in the form. Projection uses the
        // backend catalog's mmol/L and a documented conversion, never relabels it.
        scalar(submission,astronaut,checkin,at,"blood_sugar",r.get("glucose").decimalValue()
                .divide(new BigDecimal("18.0182"),6,RoundingMode.HALF_UP),"mmol/L",provenance);
        scalar(submission,astronaut,checkin,at,"body_temperature",r.get("temperature").decimalValue(),"Cel",provenance);
        UUID mood=observation(submission,astronaut,checkin,at,"mood","MOOD","main-frontend-mood-v1",provenance);
        jdbc.update("INSERT INTO mood_assessments (observation_id,score) VALUES (?,?)",mood,r.get("mood").decimalValue());
        jdbc.queryForList("SELECT observation_id FROM astronaut_assessment_observations WHERE submission_id=?",UUID.class,submission)
                .forEach(evaluations::enqueueNewObservation);
        // No sleep_sessions row: daily hours do not establish session start/end.
    }
    private void scalar(UUID submission,UUID astronaut,UUID checkin,Instant at,String indicator,BigDecimal value,String unit,String provenance) {
        UUID id=observation(submission,astronaut,checkin,at,indicator,"SCALAR","default",provenance);
        jdbc.update("INSERT INTO health_measurements (observation_id,indicator_code,value,unit) VALUES (?,?,?,?)",id,indicator,value,unit);
    }
    private UUID observation(UUID submission,UUID astronaut,UUID checkin,Instant at,String indicator,String storage,String scope,String provenance) {
        UUID scopeId=jdbc.queryForObject("SELECT id FROM measurement_comparison_scopes WHERE indicator_code=? AND scope_code=?",UUID.class,indicator,scope);
        UUID id=jdbc.queryForObject("INSERT INTO health_observations (astronaut_id,checkin_id,indicator_code,storage_kind,comparison_scope_id,"
                + "activity_context,measured_at,source_kind,source_name,source_record_id,provenance) "
                + "VALUES (?,?,?,?,?,'UNKNOWN',?,'SELF_REPORT','daily-checkin-v1',?,?::jsonb) RETURNING id",
                UUID.class,astronaut,checkin,indicator,storage,scopeId,Timestamp.from(at),submission.toString(),provenance);
        jdbc.update("INSERT INTO astronaut_assessment_observations (submission_id,astronaut_id,observation_id) VALUES (?,?,?)",submission,astronaut,id);
        return id;
    }
    public record Saved(Submission submission,boolean created) { }
    public record History(List<Submission> items,UUID nextCursor) { }
    public record Submission(UUID id,UUID astronautId,String kind,int schemaVersion,Instant recordedAt,Instant ingestedAt,
            String sourceKind,String sourceName,JsonNode data,JsonNode provenance,List<UUID> observationIds) { }
}
