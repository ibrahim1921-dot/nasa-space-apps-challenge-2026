# Dual-engine ML integration — Phase 4G

This phase implements a hash-gated Python RF/Keras service and authenticated Spring
assessment integration. Both engines execute successfully on explicit synthetic test
vectors. Observation-based execution remains deliberately blocked by the unresolved
training contract described below. This is an experimental numerical integration,
not a clinically validated diagnosis, a prescription system or a replacement for
the independent monitoring-rule alert engine.

**Notebook follow-up:** the newly supplied original notebook has been statically
inspected and compared with the trusted artifacts. The [training-contract comparison](ares-training-notebook-contract.md)
records source mappings, synthetic labels, class-1 unreachability and the RF/scaler/
threshold discrepancies. It clarifies implementation details but does not establish
the exact provenance or clinical semantics of this saved bundle. The existing runtime
and backend safeguards remain unchanged; the expanded Python suite passes 31 tests.

## Trusted artifact verification

The user confirmed direct trusted-teammate origin and authorized deserialization on
2026-11-15 before any joblib loading. Static inspection used ZIP metadata and pickle
opcode/byte inspection first. No Java process deserializes pickle/joblib.

| File | Bytes | SHA-256 |
|---|---:|---|
| astronaut_rf_model.pkl | 1113201 | a1adf079423f2ab159139ffbf3a14bf1c146132ee07283ae9c7c29ba4838a8cb |
| astronaut_scaler.pkl | 1271 | 3ee65642e64ec77aaa66b7326fb67941fe980e90d71826beddff56d51cb1fd60 |
| astronaut_config.pkl | 314 | 4631aa763e90c74f139b06f3c7db6e85fdc4c49947d49ea8117670afb13f89e1 |
| astronaut_autoencoder.keras.zip | 36004 | f816ab9dc950d31e5379720aab09af995258c08c5df9b704af32ff8321104eb0 |

Model identifier: `ares-dual-engine`. Model version is the SHA-256 bundle identity:
`63493898feb45ad54be38928c14c64f4656fd4276bc2dc1b871e5fe766e6fdfb`.
The service reads feature order and threshold from the actual saved config. The
scaler is StandardScaler; the classifier is RandomForestClassifier with ten inputs
and actual classes `[0,1,2]`. The Keras model has ten inputs and ten outputs. The
supplied ZIP already has native Keras structure; a verified byte-identical temporary
`.keras` copy permits safe loading without changing or retraining any model.

Saved sklearn version is 1.6.1; saved Keras metadata is 3.13.2. Tested runtime:
Python 3.12.16, TensorFlow CPU 2.20.0, Keras 3.13.2, sklearn 1.6.1, NumPy 2.2.6,
joblib 1.5.1. Original training Python/TensorFlow/NumPy versions are not recorded
in the supplied metadata. Existing Python 3.14 and the teammate's existing ML
environment are not modified. See [Python setup and contract](../../ml/inference/README.md).

## Compatibility outcomes and remaining teammate questions

The teammate's saved config contains only `features` and `threshold`. The blueprint,
user clarification and subsequently supplied notebook do not resolve the following
deployment compatibility requirements. The notebook's source mappings and synthetic
rules are now documented separately; they are not validated medical units or labels:

| Feature/area | Current behavior | Needed before observation inference |
|---|---|---|
| muscle_strength_kg | kgf grip and kg muscle mass are preserved as distinct source values; neither is silently substituted | Confirm physical quantity/unit, body site, device and grip protocol |
| bone_density_t_score | Existing g/cm2 measurements are retained as areal density, never converted | Source T-score with validated method and reference population, or an explicitly validated conversion and schema support |
| radiation_mgy_day | Same-origin timestamped cumulative pairs may yield an explicitly unconfirmed average-rate candidate; no cumulative total is passed as daily dose | Define absorbed-dose semantics, daily window/timezone and required averaging procedure |
| blood_sugar | Backend mmol/L is not silently interpreted as the sample's 85.0 native value | Confirm training unit and measurement method |
| mood | Notebook constructs a rounded/clipped sleep-quality/stress proxy; backend mood score/scale identity is preserved | Establish a compatible deployment input; a self-report score is not demonstrated equivalent to that proxy |
| daily_sleep_hours | Original sleep-session durations are retained, not silently treated as a whole-day total | Define the daily window and permitted aggregation of separate sleep sessions |
| All features | Missing/stale/asynchronous inputs are explicit; numerical schema bounds are not training ranges | Complete units, training ranges, context and temporal alignment contract |
| Classes 0/1/2 | Notebook supplies synthetic numeric rules, but its filters rule out class 1 while the saved forest contains it; raw class/blueprint name remain marked unverified | Supply the exact matching training/export revision and label provenance; clinical validation is separate |

The model is **not clinically validated**. No health threshold from the sample
blueprint is activated. Its inconsistent radiation recommendation and example sleep,
radiation and bone cutoffs are not implemented. No medication, evacuation, schedule
change or exercise prescription is generated.

Explicit synthetic vectors acknowledge `BLUEPRINT_NATIVE_UNVERIFIED` units and
exercise the trained numerical pipeline. They are always labeled synthetic and
nonclinical, require a separate demo flag and development/demo environment, cannot
attach real observation IDs, and do not prove compatibility with backend physiology.

## Backend persistence and execution

V37 reuses `ml_health_assessments` and its existing immutable V29 history. It adds
only `ml_assessment_requests` (actor, idempotency key/hash, mode and synthetic label)
and `ml_assessment_observations` (immutable subject-owned source links). Composite
foreign keys prevent cross-astronaut attachment. Updates, deletes and truncation of
the new audit/link records are refused. No V1–V36 migration was changed.

An explicit officer request records `assessment_trigger=SCHEDULED`; this existing
enum is the generic non-alert/non-checkin execution category, not a newly installed
background scheduler. No ingestion hook or automatic ML scheduler is added.

Request handling authenticates/rechecks the officer and subject, validates mode,
cutoff and inputs, serializes the subject/key with a transaction advisory lock,
and persists the completed attempt atomically. Same key + same canonical request
returns the existing assessment; same key + different payload/actor returns 409.
Concurrent repeats produce one model call and one durable assessment. Keys are
scoped to the target astronaut. Retry a failed execution deliberately with a new key;
the existing failed result is never rewritten or silently retried.

The retained input snapshot includes explicit vector values or selected observation
IDs, original measurement values/units, scope/context, timestamps, synthetic evidence,
freshness policy, compatibility issues and expected artifact fingerprints. The raw
model result retains probabilities, runtime/model metadata, fingerprints, class,
MSE, saved threshold, nonclinical flags and limitations, augmented with explicit
educational finding codes/mapping version. Actor identity remains in database audit
evidence and is omitted from the public snapshot.

The current Python service succeeds only for synthetic vectors. Every observation
request either yields `INSUFFICIENT_DATA` (missing, stale or asynchronous evidence)
or `INCOMPATIBLE_FEATURES` (present evidence with unresolved units/protocols). Those
are immutable FAILED execution records with an explicit domain outcome and input
issues, not fabricated predictions. The existing table's success constraint is
preserved: no raw result is stored for a failed execution. Service outage, request
timeout or invalid returned metadata similarly persist a FAILED record with a safe
fixed error code. The POST returns HTTP 200 with that completed attempt's outcome;
clients must inspect `inferenceStatus`, not assume HTTP 200 means inference success.

Observation selection is bounded to 100 non-superseded records at or before cutoff,
or up to 100 explicit owned IDs. An unavailable/cross-subject/future/superseded
explicit ID returns the same 404. Multiple scopes/contexts are flagged instead of
being blended. Default age and skew limits are conservative transport-alignment
policies, not clinical cadence prescriptions; the current real-data contract is
incompatible regardless. No simulator value, personal baseline, muscle-mass value
or unvalidated T-score fills missing data.

For two compatible cumulative-dose observations:

```text
candidate average mGy/day = (later total mGy - earlier total mGy)
                           * 86400 / elapsed seconds
```

Both must have the same immutable comparison scope/astronaut/accumulation origin,
increasing timestamps and nondecreasing totals. The exact interval is retained.
A fractional-day average is not asserted to be the teammate's daily feature.
Candidate metadata explicitly says `trainingWindowCompatible=false`. Invalid pairs
are flagged. No mSv conversion is made.

## Endpoints and authentication

Python (internal, loopback by default):

- `GET http://127.0.0.1:18766/health`
- `GET http://127.0.0.1:18766/ready`
- `POST http://127.0.0.1:18766/api/v1/diagnostics/assess` — Bearer-token authenticated

Spring, using the suggested isolated local port:

- `POST http://127.0.0.1:18080/api/crew/{astronautId}/ml-assessments` — NASA_OFFICER, session + CSRF
- `GET http://127.0.0.1:18080/api/crew/{astronautId}/ml-assessments?limit=20` — officer or the astronaut themself; limit 1–100
- `GET http://127.0.0.1:18080/api/ml-assessments/{assessmentId}` — officer or the assessment's astronaut

Lists and detail reads cover this integration's request-linked ARES assessments;
unrelated legacy assessment JSON is not interpreted as an ARES result. Archived
astronauts cannot receive a new assessment. Officers can retrieve existing history
under the current crew policy; disabled/archived account restrictions remain active.
Cross-astronaut reads return 404. Unauthorized creation and missing CSRF return 403;
anonymous requests return 401. Existing CORS, HttpOnly and session controls remain
unchanged. Feature flags affect creation, not authorized history reads.

The internal client accepts only literal loopback HTTP(S) origins without URL
credentials, path, query or fragment. Redirects are disabled. Connection timeout is
1 second, complete request/body timeout is 5 seconds by default; both have bounded
configuration ranges. The client bounds responses to 64 KiB and validates schema,
numeric finiteness, probabilities, actual class domain, threshold/anomaly consistency,
synthetic/nonclinical flags, expected feature order and all artifact identities.
The internal service token is never returned to the browser.

## Request and response examples

Observation request (no asserted numeric values):

```json
{
  "requestKey": "ec1f08fc-2e17-47db-97ab-c86de766482c",
  "cutoff": "2026-11-15T00:00:00Z",
  "inputMode": "OBSERVATIONS",
  "observationIds": []
}
```

An empty ID list selects bounded history. With no compatible evidence, the response
includes `executionStatus="FAILED"`, `inferenceStatus="INSUFFICIENT_DATA"`, null
prediction, no inferred findings/countermeasures and explicit `inputSnapshot.issues`.

Synthetic numerical request, permitted only with the additional demo gate:

```json
{
  "requestKey": "ce6a094a-26c1-4b8e-af63-4b6fbc49c5e7",
  "cutoff": "2026-11-15T00:00:00Z",
  "inputMode": "EXPLICIT_SYNTHETIC_VECTOR",
  "observationIds": [],
  "synthetic": true,
  "unitSystem": "BLUEPRINT_NATIVE_UNVERIFIED",
  "features": {
    "systolic_bp": 115.0, "diastolic_bp": 75.0, "heart_rate": 98.0,
    "blood_sugar": 85.0, "body_temperature": 36.8, "daily_sleep_hours": 5.2,
    "mood": 2, "muscle_strength_kg": 42.5, "bone_density_t_score": 0.0,
    "radiation_mgy_day": 0.28
  }
}
```

Abbreviated successful response from actual trained-model execution:

```json
{
  "id": "<persisted assessment UUID>",
  "astronautId": "<authorized fictional target UUID>",
  "executionStatus": "SUCCEEDED",
  "inferenceStatus": "SUCCEEDED",
  "synthetic": true,
  "nonclinical": true,
  "prediction": {
    "riskClass": 1,
    "blueprintLabel": "Warning",
    "classSemanticsVerified": false,
    "anomalyScore": 1.3087659234557283,
    "anomalyThreshold": 0.3713613787649183,
    "anomaly": true,
    "modelIdentifier": "ares-dual-engine",
    "modelVersion": "63493898feb45ad54be38928c14c64f4656fd4276bc2dc1b871e5fe766e6fdfb",
    "artifactSha256": {"<all four filenames>": "<their verified SHA-256>"}
  },
  "findingCodes": ["blood-pressure-systolic-context", "blood-pressure-diastolic-context", "heart-rate-value-context", "blood-sugar-value-context", "body-temperature-value-context", "sleep-hours-duration-context", "mood-score-context"],
  "countermeasures": [],
  "educationalTopics": []
}
```

The actual DTO additionally includes cutoff/request/completion timestamps,
`disclaimer`, the retained `inputSnapshot`, populated approved library entries and
topic cards. Countermeasures have the Phase 4F title, summary/body explanation,
authorization note, indicator codes, source references and media metadata.
`educationalTopics` supplies the corresponding cards and their pending image/video
placeholders keyed by `indicatorCode`; no asset is invented or downloaded. Pending
media has `available=false` and must not be embedded as a real image/video.

The seven supported finding codes are **context education only**, not a claim that
a feature caused the RF output. There is no hardcoded high-risk or treatment rule.
The incompatible grip, T-score and daily-dose features do not masquerade as the
library's kgf, areal-density or cumulative-dose findings. Current published library
entries are looked up through the persisted finding codes; withdrawal hides the
entry without rewriting the historical model result. Keep the full disclaimer and
individual-authorization note in any future display.

## Local environment and startup

Python setup and its protected numerical request are documented in
[ml/inference/README.md](../../ml/inference/README.md). Start from a dedicated Python
3.12 environment, or the provided CPU image. Native uvicorn defaults to loopback.
Docker publication is also host-loopback-only; the integration tests use an owned
read-only-source container and a private temporary token.

| Process | Environment variable | Default / purpose |
|---|---|---|
| Python | ARES_TRUSTED_ARTIFACTS | unset; must explicitly equal `true` after trust verification |
| Python | ARES_MODEL_DIR | `ml/models/ares_dual_engine` from repository root |
| Python | ARES_SERVICE_TOKEN | private random token, at least 32 characters |
| Backend | ML_ASSESSMENTS_ENABLED | `false` |
| Backend | ML_SYNTHETIC_VECTORS_ENABLED | `false`; additionally requires development/demo environment |
| Backend | ML_INFERENCE_URL | `http://127.0.0.1:18766` |
| Backend | ML_SERVICE_TOKEN | same private token as Python |
| Backend | ML_CONNECT_TIMEOUT_MS | `1000`, allowed 100–10000 |
| Backend | ML_REQUEST_TIMEOUT_MS | `5000`, allowed 100–30000 |
| Backend | ML_MAX_AGE_SECONDS | `86400`, transport freshness policy |
| Backend | ML_MAX_SKEW_SECONDS | `21600`, transport alignment policy |
| Backend | ASTROHEALTH_ENV | existing environment gate; development/demo for numerical vector tests |
| Backend | DB_URL / DB_USER / DB_PASSWORD | **verified disposable PostgreSQL only** for local testing |

In a private local shell with the disposable DB connection already verified:

```powershell
$env:JAVA_HOME='C:/Users/augus/.jdks/openjdk-21.0.2'
$env:ASTROHEALTH_ENV='development'
$env:ML_ASSESSMENTS_ENABLED='true'
$env:ML_SYNTHETIC_VECTORS_ENABLED='true'
$env:ML_INFERENCE_URL='http://127.0.0.1:18766'
# Privately supply ML_SERVICE_TOKEN matching ARES_SERVICE_TOKEN.
# DB_URL/DB_USER/DB_PASSWORD must identify only the separately verified disposable DB.
cd backend
.\mvnw.cmd spring-boot:run '-Dspring-boot.run.arguments=--server.address=127.0.0.1 --server.port=18080'
```

Boot applies Flyway through V37. Do not point this command at development port 5433
or production merely to test it. This phase used only Testcontainers databases and
did not apply V37 to development. Use the existing [session/CSRF login flow](../../docs/authentication-phase2.md)
to call backend APIs; never put the internal Bearer token in a browser. No monitoring
evaluation flag is changed by enabling ML. Observation ingestion has no dependency
on the model client, so model downtime cannot fail ingestion.

## Testing and implementation files

Python command:

```text
python -m pytest -q ml/inference/tests -p no:cacheprovider
```

Backend focused mocked/contract suites:

```powershell
.\mvnw.cmd -B '-Dtest=MlContractTests,MlAssessmentTests,AccountSchemaTests' test
```

With the real Python service already ready and `ML_INFERENCE_URL`/`ML_SERVICE_TOKEN`
privately configured, enable the explicit live test:

```powershell
.\mvnw.cmd -B '-Dtest=MlContractTests,MlAssessmentTests,MlTrainedModelTests,AccountSchemaTests' '-Dastrohealth.ml.live-test=true' test
.\mvnw.cmd -B '-Dastrohealth.ml.live-test=true' test
```

Without live opt-in, `MlTrainedModelTests` is deliberately skipped; ordinary tests
never require a Python service. This phase's focused and full runs explicitly enable
it. All database tests use isolated PostgreSQL 17 Testcontainers. Mock-server tests
cover failures/timeouts/malformed model responses and do not claim real predictions.
The live test calls the running real Python engines, persists the actual output,
retrieves it, checks idempotency/education and proves no rule/ML alert is generated.

New Python files are all under `ml/inference/`: package marker, `app.py`, `schemas.py`,
`model_loader.py`, `artifacts.json`, `inspect_artifacts.py`, `requirements.txt`,
`Dockerfile`, `examples/synthetic-vector.json`, `tests/test_inference.py` and README.

New backend files:

- `V37__dual_engine_assessment_requests.sql`
- `dto/MlAssessmentDtos.java`
- `service/AresModelContract.java`, `MlInferenceClient.java`, `MlObservationInputs.java`, `MlAssessmentService.java`, `MlProblem.java`
- `controller/MlAssessmentController.java`, `MlAssessmentExceptionHandler.java`
- `AresTestFixtures.java`, `MlContractTests.java`, `MlAssessmentTests.java`, `MlTrainedModelTests.java` under tests
- `docs/dual-engine-ml-phase4g.md`

Updated backend files: `SecurityConfig.java`, `application.yaml`, `AccountSchemaTests.java`.
Phase 4F files were reused unchanged. No existing teammate ML code, model artifact,
fitness_quantiles.joblib, frontend, simulation or V1–V36 migration was modified.
Nothing is staged, committed or pushed.

## Actual execution results — 2026-11-15

| Suite | Tests | Failures | Errors | Skips | Result |
|---|---:|---:|---:|---:|---|
| Python inference, including actual trained artifacts and HTTP TestClient | 24 | 0 | 0 | 0 | passed, 12.89 seconds |
| Focused Spring contract/security/persistence + real model HTTP | 24 | 0 | 0 | 0 | BUILD SUCCESS, 58.196 seconds |
| Full backend, live model opt-in enabled | 322 | 0 | 0 | 0 | BUILD SUCCESS, 5 minutes 45 seconds |

The Python tests contain real classifier and autoencoder execution, not substitute
weights. `MlAssessmentTests` uses a loopback mock server for controlled failure,
timeout, response-validation and concurrency tests. `MlTrainedModelTests` separately
uses real HTTP to the actual loaded Python RF/Keras engines, with PostgreSQL 17
assessment persistence/retrieval and idempotency checks. The full run includes that
live test; none of the 322 tests were skipped.

Actual numerical sample: raw class **1**, unverified blueprint label **Warning**,
MSE **1.3087659234557283**, saved threshold **0.3713613787649183**, `is_anomaly=true`.
This does not establish clinical correctness, a causal finding or training-label
semantics. The saved models and all their hashes were reverified unchanged after
execution. The existing `fitness_quantiles.joblib` and other protected tracked ML
files have no diff.

The live wire test caught and fixed the Java-double/strict-integer mood mismatch.
Java now serializes validated integer mood values as JSON integers, and the mock
server also asserts that wire contract. A full-run PostgreSQL connection-limit
failure was fixed by closing the two new ML test contexts after their classes;
production pool limits and database settings were not changed. The final full
rerun passed all later ingestion/scope-provisioning suites as well.

Evidence:

- `backend/target-phase4g-python-tests.log`
- `backend/target-phase4g-focused-live.log`
- `backend/target-phase4g-full.log`
- `backend/target/phase4g-live/actual-http-prediction.json`
- `backend/target/phase4g-live/artifact-validation-and-prediction.json`
- `backend/target/phase4g-live/final-artifact-verification.json`
- `backend/target/phase4g-live/events.jsonl`

An initial operator-child live-test launch could not resolve its Docker context.
The final focused/full suites were launched directly from the working PowerShell
Docker context; the private token was read into process environment without being
printed or written to disk. The final passing suite logs above supersede that
initial operator-child attempt.

The owned inference container `astrohealth-ares-live-2c9ae16ab455` was stopped and
automatically removed after verification; port 18766 was confirmed closed. Python
test containers and PostgreSQL Testcontainers were removed by their owned lifecycle.
The four pre-existing container IDs remain, including development PostgreSQL on
5433. No development/production database was connected to, migrated or provisioned.
No existing container or volume was stopped or deleted. Model artifacts were mounted
read-only and no inference token is retained in evidence.

Numerical dual-engine integration is complete. The remaining blockers to actual
observation predictions are the specific training-contract and compatible-source
questions in the table above, including T-score evidence. They are enforced as
explicit data-compatibility outcomes rather than guessed conversions or predictions.
Stop here for review; no main frontend or further model integration is performed.
