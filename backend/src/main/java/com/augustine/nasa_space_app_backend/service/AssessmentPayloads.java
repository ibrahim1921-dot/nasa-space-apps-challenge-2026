package com.augustine.nasa_space_app_backend.service;

import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.DateTimeException;
import java.util.*;

/** Strict, version-one schemas transcribed from the existing main frontend forms.
 * No coercion of strings to numbers/booleans, clinical scoring or client provenance.
 */
public final class AssessmentPayloads {
    private AssessmentPayloads() { }

    public static Instant validate(String kind, JsonNode body) {
        if (body == null || body.toString().length() > 16000) throw invalid();
        switch (kind) {
            case "CHECKIN" -> {
                object(body, "recordedAt", "reading", "context");
                JsonNode r = body.get("reading");
                object(r, "systolic", "diastolic", "heart_rate", "glucose", "temperature", "sleep_hours", "mood");
                pressure(r, 260, 160);
                number(r,"glucose",20,600); number(r,"temperature",30,43);
                number(r,"sleep_hours",0,24); integer(r,"mood",1,5);
                JsonNode c = body.get("context");
                object(c,"isolation","workload","lastFamilyCall","crewTension","notes");
                integer(c,"isolation",1,5);
                option(c,"workload",Set.of("light","normal","heavy","overloaded"));
                option(c,"lastFamilyCall",Set.of("today","1-3-days","4-7-days","over-a-week"));
                bool(c,"crewTension"); text(c,"notes",2000);
            }
            case "SLEEP_LOG" -> {
                object(body,"recordedAt","date","night");
                String date = text(body,"date",10);
                try { if (!LocalDate.parse(date).toString().equals(date) || date.length()!=10) throw invalid(); }
                catch (DateTimeException ex) { throw invalid(); }
                JsonNode n=body.get("night");
                object(n,"sleep_hr_median","sleep_hr_p5","total_sleep_h","wake_pct","n3_pct_of_sleep","rem_pct_of_sleep");
                double median=number(n,"sleep_hr_median",25,200);
                if (number(n,"sleep_hr_p5",25,200)>median) throw invalid();
                number(n,"total_sleep_h",0,16); number(n,"wake_pct",0,100);
                if (number(n,"n3_pct_of_sleep",0,100)+number(n,"rem_pct_of_sleep",0,100)>100) throw invalid();
            }
            case "STAND_TEST" -> {
                object(body,"recordedAt","test");
                JsonNode t=body.get("test");
                object(t,"supine","standing_1min","standing_3min","symptoms","partial","timing_skipped");
                boolean partial=bool(t,"partial"); bool(t,"timing_skipped");
                for (String slot : List.of("supine","standing_1min","standing_3min")) {
                    JsonNode r=t.get(slot);
                    if (!r.isNull()) { object(r,"heart_rate","systolic","diastolic"); pressure(r,250,150); }
                }
                if (!partial && (t.get("supine").isNull()
                        || (t.get("standing_1min").isNull() && t.get("standing_3min").isNull()))) throw invalid();
                JsonNode symptoms=t.get("symptoms");
                if (!symptoms.isArray() || symptoms.size()>4) throw invalid();
                Set<String> seen=new HashSet<>();
                for (JsonNode s:symptoms) {
                    if (!s.isTextual() || !Set.of("dizzy","blurred_vision","nausea","felt_faint").contains(s.asText())
                            || !seen.add(s.asText())) throw invalid();
                }
            }
            default -> throw new AssessmentProblem(404,"Assessment type not found.");
        }
        try {
            Instant at=Instant.parse(text(body,"recordedAt",40));
            if (at.isBefore(Instant.parse("0001-01-01T00:00:00Z"))
                    || !at.isBefore(Instant.parse("9999-12-31T23:59:59Z"))) throw invalid();
            return at;
        } catch (DateTimeException ex) { throw invalid(); }
    }
    private static void pressure(JsonNode r,int systolicMax,int diastolicMax) {
        number(r,"heart_rate",25,220);
        if (number(r,"diastolic",30,diastolicMax)>=number(r,"systolic",60,systolicMax)) throw invalid();
    }
    private static void object(JsonNode n,String... fields) {
        if(n==null || !n.isObject() || n.size()!=fields.length) throw invalid();
        for(String f:fields) if(!n.has(f)) throw invalid();
    }
    private static double number(JsonNode n,String field,double min,double max) {
        JsonNode v=n.get(field);
        if(v==null || !v.isNumber()) throw invalid();
        double value=v.asDouble();
        if(!Double.isFinite(value) || value<min || value>max) throw invalid();
        return value;
    }
    private static void integer(JsonNode n,String field,int min,int max) {
        double v=number(n,field,min,max); if(v!=Math.rint(v)) throw invalid();
    }
    private static boolean bool(JsonNode n,String field) {
        if(n.get(field)==null || !n.get(field).isBoolean()) throw invalid();
        return n.get(field).asBoolean();
    }
    private static String text(JsonNode n,String field,int max) {
        JsonNode v=n.get(field);
        if(v==null || !v.isTextual() || v.asText().length()>max || v.asText().indexOf('\0')>=0) throw invalid();
        return v.asText();
    }
    private static void option(JsonNode n,String field,Set<String> options) {
        if(!options.contains(text(n,field,32))) throw invalid();
    }
    public static AssessmentProblem invalid() { return new AssessmentProblem(400,"Invalid assessment fields; use the version-one form contract."); }
}
