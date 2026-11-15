# Phase 4I: astronaut assessment persistence

This supersedes the missing-assessment-API section of
[`docs/astrohealth-integration-handover.md`](../../docs/astrohealth-integration-handover.md).
The main frontend files and Simulation Lab are unchanged. These APIs persist
answers; they do not implement frontend baseline scoring, generate clinical
scores, or invoke ML. Existing monitoring evaluation can consume the compatible
check-in observations only when its existing evaluation feature is enabled.

## Routes and security

Prefix: `/api/crew/{astronautUuid}`. Obtain the UUID from authenticated
`GET /api/auth/me` → `profile.astronautId`, not browser demo identity/crew code.

| Resource | POST | GET collection | GET one |
|---|---|---|---|
| Daily check-in | `/checkins` | `/checkins?limit=20&before={id}` | `/checkins/{id}` |
| Nightly sleep log | `/sleep-logs` | `/sleep-logs?limit=20&before={id}` | `/sleep-logs/{id}` |
| Grouped stand test | `/stand-tests` | `/stand-tests?limit=20&before={id}` | `/stand-tests/{id}` |

Astronauts submit and retrieve only their own records. NASA officers retrieve
crew records but cannot submit on behalf of an astronaut. Archived/disabled
astronaut sessions are revoked by the existing account-status filter. Officers
can read retained history for archived crew. No update/delete endpoint exists.

Use session cookies (`credentials: 'include'`) and the existing CSRF handshake:
GET `/api/auth/csrf`, POST `/api/auth/login` with its returned header/token,
then fetch a fresh CSRF token after login. Every submission sends JSON,
`Content-Type: application/json`, the current CSRF header and
`Idempotency-Key: <client-generated UUID>`. CORS now allows this header for the
configured explicit frontend origins. No CSRF/session security was disabled.

Keep the same idempotency key and payload for offline retries. Keys are scoped
to astronaut and assessment type. Concurrent identical submissions return one
stored resource; a changed payload under that key returns 409. JSON object key
order and numeric formatting are insignificant (PostgreSQL JSONB equality);
array order and timestamp string representations are significant. A new key
means a new entry even if values match. Existing device record UUIDs can be keys.

## Request bodies and actual form mapping

### CheckinForm.jsx → POST /checkins

```json
{
  "recordedAt": "2026-11-14T12:00:00Z",
  "reading": {
    "systolic": 115, "diastolic": 75, "heart_rate": 65,
    "glucose": 90, "temperature": 36.8, "sleep_hours": 7.5, "mood": 4
  },
  "context": {
    "isolation": 2, "workload": "normal", "lastFamilyCall": "today",
    "crewTension": false, "notes": "Fictional demo entry"
  }
}
```

Use the saved daily-vitals record's `recorded_at`, `payload.reading` and
`payload.context`. Omit context's derived `sleepHours` (already in reading) and
client `missionDay` (not authoritative mission data). Notes are required but may
be empty; maximum 2,000 characters is a transport limit added here. The context
form's current POST `/api/checkins` is a Next.js acknowledgement only. Replace
it with this combined save rather than submitting context twice.

Validation follows `lib/vitalsCheckin.js` and `constants/checkin.js`:

| Field | Type, unit and inclusive transport bounds |
|---|---|
| systolic / diastolic | number, mmHg, 60–260 / 30–160; diastolic < systolic |
| heart_rate | number, bpm, 25–220 |
| glucose | number, mg/dL, 20–600 |
| temperature | number, °C, 30–43 |
| sleep_hours | number, h, 0–24; daily self-reported estimate |
| mood | integer 1–5, existing app item (very low → very good) |
| isolation | integer 1–5, existing app item (not at all → very isolated) |
| workload | light, normal, heavy, overloaded |
| lastFamilyCall | today, 1-3-days, 4-7-days, over-a-week |
| crewTension | boolean |

These bounds reject input errors; they are not medical thresholds. Mood and
isolation remain separate raw ordinal answers. Neither is a validated composite
questionnaire score or the ML notebook's sleep/stress-derived mood proxy.

### LogNightForm.jsx → POST /sleep-logs

```json
{
  "recordedAt": "2026-11-14T12:00:00Z",
  "date": "2026-11-14",
  "night": {
    "sleep_hr_median": 60, "sleep_hr_p5": 50, "total_sleep_h": 7.5,
    "wake_pct": 10, "n3_pct_of_sleep": 20, "rem_pct_of_sleep": 25
  }
}
```

`LogNightForm` emits `{night,date}`; add the device record creation instant as
`recordedAt`. `date` is the entered calendar night label, not a fabricated UTC
session boundary. It must be a real date in YYYY-MM-DD form. The backend path
UUID replaces the mock PhysioNet `subject_id`; it does not silently map a dataset
subject onto a real astronaut.

As in `lib/nightlyScore.js`, both HR numbers are 25–200 bpm, total sleep is 0–16 h,
and percentages are 0–100 (not fractions). p5 ≤ median and N3 + REM ≤ 100.
All six numbers are required. This is a manually transcribed wearable summary,
not a verified device upload. `extra_history`, client scores and dataset subject
IDs are not accepted. Retrieve authoritative submitted history from GET instead.

The current form does **not** collect start/end timestamps or asleep seconds.
These sleep logs therefore deliberately do not create `sleep_sessions` rows,
invent session boundaries, or reinterpret sleep hours as a complete session.
The existing timed-session schema remains available to ingestion paths with
actual session timestamps. Supporting that additional form is outside this contract.

### StandTest.jsx → POST /stand-tests

```json
{
  "recordedAt": "2026-11-14T12:00:00Z",
  "test": {
    "supine": {"heart_rate": 60, "systolic": 115, "diastolic": 75},
    "standing_1min": {"heart_rate": 70, "systolic": 110, "diastolic": 70},
    "standing_3min": null,
    "symptoms": ["dizzy"], "partial": false, "timing_skipped": false
  }
}
```

Map standTestStore's `recorded_at` and `payload` to `recordedAt` and `test`.
Each nonnull reading requires HR 25–220 bpm, systolic 60–250 mmHg, diastolic
30–150 mmHg and diastolic < systolic, as in `lib/standTest.js`.
All three slot keys, both booleans and the symptoms array are explicit in this
wire schema. This matches the cleaned form payload; fill absent slots with null.
For `partial:false`, require supine and at least one standing reading. For
`partial:true`, any or all slots may be null, preserving a stopped test.
Symptoms are unique values from dizzy, blurred_vision, nausea, felt_faint;
an empty array means no selected symptoms. `timing_skipped` is retained as a
reported flag, not proof that any timing protocol was followed.

No per-posture measured timestamps are collected by the form. The grouped raw
readings remain in the stand-test submission rather than creating independent
observation rows with invented 1-/3-minute timestamps or generic resting scopes.

## Responses, history and errors

Successful new POST returns 201, exact retry returns 200; both return the same
resource and `Location: /api/crew/{uuid}/{resource}/{id}`:

```json
{
  "id": "<submission UUID>", "astronautId": "<astronaut UUID>",
  "kind": "CHECKIN", "schemaVersion": 1,
  "recordedAt": "2026-11-14T12:00:00Z", "ingestedAt": "<server instant>",
  "sourceKind": "SELF_REPORT", "sourceName": "daily-checkin-v1",
  "data": {"recordedAt": "...", "reading": {}, "context": {}},
  "provenance": {
    "entry_method": "MANUAL_ENTRY", "form_version": 1,
    "actor_account_id": "<server account UUID>",
    "measurement_verification": "NOT_DEVICE_VERIFIED"
  },
  "observationIds": ["<compatible projected observation UUID>"]
}
```

`data` contains the full accepted body, including all raw answers (the shortened
objects above are illustrative only). Other kinds/source names are
`SLEEP_LOG`/`sleep-log-v1` and `STAND_TEST`/`stand-test-v1`; their observationIds
are empty. recordedAt is client report time; ingestedAt is server insertion time.
PostgreSQL header timestamps have microsecond precision; the original timestamp
string remains in data. ISO instants are bounded to years 0001–9999. No mission,
device, instrument, timezone, scoring result or simulation metadata is fabricated.

GET collection returns `{items:[<resources>],nextCursor:<last UUID or null>}`.
Ordering is `(recordedAt,id)` descending; limit defaults to 20, allowed 1–100.
Pass returned nextCursor as `before`; no client cursor timestamp is trusted.
The cursor must belong to the same astronaut and resource type. GET one is
scoped to both astronaut UUID and resource type. New history entries may appear
before an existing page; pagination is not a snapshot of concurrent backdated inserts.

Errors use `{ "error": "<safe message>" }`:

| Status | Meaning |
|---|---|
| 400 | Missing/malformed UUID key, invalid identifier/cursor/limit, malformed JSON, unknown/missing fields, wrong types, invalid range/date or oversized notes |
| 401 | Missing/expired/revoked session |
| 403 | Missing/invalid CSRF, another astronaut's path, or officer submission |
| 404 | Submission absent from the authorized path/type; officer target profile absent |
| 409 | Same key with a different valid body, or a conflicting retained mood-scale definition |
| 503 | Persistence unavailable; no partial save is committed |

Numbers must be JSON numbers and flags JSON booleans, not strings; NaN/infinity
are rejected. Unknown fields, client roles/source/provenance/scores are rejected.
Every key shown in each request is required, including null stand slots. The
version-one body is limited to 16,000 serialized characters after JSON parsing.

## Storage and frontend work remaining

V38 adds an append-only, versioned `astronaut_assessment_submissions` history and
observation links constrained to the same astronaut. It reuses `astronaut_checkins`
for daily check-in headers and writes five compatible SELF_REPORT observations:
BP, HR, glucose, temperature and mood. Daily sleep estimates stay in raw answers.
Raw glucose mg/dL is retained; the catalog projection is mmol/L = mg/dL ÷ 18.0182,
rounded half-up to six decimals. HR projects to beats/min and °C to Cel. The new
`main-frontend-mood-v1` scale scope identifies only the app's raw 1–5 item. It is
registered transactionally on the first check-in submission and reused only with
the same definition. V38 seeds no scopes or clinical limits.
Activity context stays UNKNOWN: the form gives measurement instructions but does
not confirm the actual activity context. A resting protocol is not assumed from
those instructions when selecting existing monitoring rules or baselines.
Simulation scopes and metadata are never used for these submissions.

Frontend teammates still need to implement cookie/CSRF login transport, map
authenticated UUIDs, preserve context in the daily outbox (contractMap currently
drops it), send Idempotency-Key and adapt successful responses as persistence
acknowledgements. Do not look for `overall`, `status`, `indicators`, sleep scores
or reasons in this API response. Keep any device evaluation separately labelled;
do not mark a submission scored by the backend because it was stored. Replace
mock/process-memory histories with these resource GETs and retain device history
for unsynced records. Existing one-click demo identity grants no backend access.

## Verification and local rollout

Tests use PostgreSQL 17 Testcontainers with disposable databases, never DB_URL or
the development database. Run from `backend` with a working JDK/Maven and Docker:

```powershell
.\mvnw.cmd -B '-Dtest=AssessmentPayloadTests,AstronautAssessmentTests,AccountSchemaTests' test
.\mvnw.cmd -B test
```

The migration test expects V38 and verifies upgrading retained earlier schemas.
The assessment tests cover raw round trips, observation projection/unit conversion,
history/tied-timestamp pagination, partial tests, concurrent retries/conflicts,
strict validation, role/ownership/CSRF, revoked sessions and database immutability.
V1–V37 are unchanged. Do not start the application against an unapproved database:
normal startup applies Flyway. Apply V38 to a teammate's own local database only
after that operator authorizes its migrations. No deployment/migration against
development PostgreSQL was performed as part of this implementation.

Verified on 2026-11-15 using JDK 25 (Java 17 compilation target), offline Maven
dependencies and disposable PostgreSQL **17.12** Testcontainers:

- Focused checks: **33 passed** — 21 payload-validation cases, 8 assessment
  integration tests and 4 schema/upgrade tests. These also passed in the final
  full-suite run.
- Full backend suite: **351 discovered, 350 passed, 0 failures/errors, 1 skipped**;
  build success in 4 minutes 7 seconds. The skipped test is the pre-existing
  explicitly opted-in live Python/ML HTTP test (`astrohealth.ml.live-test`), not
  an assessment test. No Python test or training cell was executed.
- Final run log: `backend/target/phase4i-verified-regression.log`; individual
  results: `backend/target/surefire-reports/`. These are generated local evidence.
- The new isolated assessment test context closes its connection pool after the
  class, preserving connection capacity for the existing regression suite.
- All four ML artifacts still match their pinned hashes. No frontend, simulation,
  historical migration, development database, credential, staging, commit or push
  operation was performed.
