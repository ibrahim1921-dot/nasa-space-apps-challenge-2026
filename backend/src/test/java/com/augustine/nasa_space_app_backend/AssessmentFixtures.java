package com.augustine.nasa_space_app_backend;

final class AssessmentFixtures {
    static final String CHECKIN="""
        {"recordedAt":"2026-11-14T12:00:00Z",
         "reading":{"systolic":115,"diastolic":75,"heart_rate":65,"glucose":90,"temperature":36.8,"sleep_hours":7.5,"mood":4},
         "context":{"isolation":2,"workload":"normal","lastFamilyCall":"today","crewTension":false,"notes":"Fictional test entry"}}
        """;
    static final String SLEEP="""
        {"recordedAt":"2026-11-14T12:00:00Z","date":"2026-11-14",
         "night":{"sleep_hr_median":60,"sleep_hr_p5":50,"total_sleep_h":7.5,"wake_pct":10,"n3_pct_of_sleep":20,"rem_pct_of_sleep":25}}
        """;
    static final String STAND="""
        {"recordedAt":"2026-11-14T12:00:00Z","test":{
         "supine":{"heart_rate":60,"systolic":115,"diastolic":75},
         "standing_1min":{"heart_rate":70,"systolic":110,"diastolic":70},"standing_3min":null,
         "symptoms":["dizzy"],"partial":false,"timing_skipped":false}}
        """;
    private AssessmentFixtures() { }
}
