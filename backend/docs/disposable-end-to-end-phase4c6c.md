# Phase 4C.6C — executed disposable live integration

Executed on 2026-11-15. This is a report of real processes and HTTP/database results,
not a mocked integration or another readiness review.

## Isolation and prerequisites

- Existing source backup: `C:\Users\augus\AppData\Local\Temp\AstroHealth-source-backup-20261115-024503-103`.
  All 302 manifest hashes verified, zero mismatches.
- New container: `astrohealth-e2e-3935308e5f46`, ID prefix `9f0d20f50f60`, image
  `postgres:17`. PostgreSQL data used tmpfs, no named/development volume, automatic
  removal on stop, and the only PostgreSQL publication was `127.0.0.1:15432`.
- Dedicated database: `astrohealth_e2e_3935308e5f46`. All JDBC actions used exactly
  `jdbc:postgresql://127.0.0.1:15432/astrohealth_e2e_3935308e5f46`.
- Container ID/name/unique label, loopback port, tmpfs mounts and DB URL were
  checked before migration/provisioning/startup. Additional rule provisioning
  verifications are recorded in `target/phase4c6c/target-action-verifications.jsonl`.
- Flyway applied and validated exactly V1–V35. No existing migration was modified
  and no new migration was needed.
- Existing `DemoProvisioningCommand` ran through a genuine hidden-input console:
  five accounts and four fictional astronaut profiles created. Initial passwords
  were separate random temporary secrets, kept in operator process memory and
  hidden console input; no password/cookie/CSRF value was written to artifacts.
- Backend: `127.0.0.1:18080`; actual Python API: `127.0.0.1:18765`; independent
  Simulation Lab UI: `127.0.0.1:5173`. No main frontend was changed or launched.
- The disposable backend alone opted into capture registration, evaluation and
  demo thresholds. For actual browser verification it explicitly allowed only
  `http://127.0.0.1:5173` with credentials. The established local HTTP setting
  `SESSION_COOKIE_SECURE=false` was process-local; HttpOnly, SameSite, session
  authentication and CSRF remained enabled. No global application settings changed.

The integration launcher supplied the existing `LabServer` with an actual Python
engine configured to start at `2026-11-15T05:10:56Z`. This explicit future virtual
origin allowed prospective rule approval without backdating rules, altering the
backend clock or rewriting exported observations. The existing simulator API and
driver generated every original envelope. Cadences were not shortened. One virtual
day followed by a 28-day step yielded 15,252 retained source observations; only
37 distinct observations were persisted in the backend.

## Actual manifest, capture and mapping

`GET /api/manifest` returned 200 with the complete original manifest, workspace
`ad145c82-8bfb-4104-be45-947874a8f939` and run
`2ff39530-0751-511d-afb3-0402605bfe11`. Authenticated capture registration returned
201, ACTIVE, capture `9cb7626a-7f64-40dc-aba5-66869c89574f`.

| Source crew | Actual source UUID | Backend crew | Actual backend UUID | Observations | Alerts |
|---|---|---|---|---:|---:|
| sim-crew-01 | ca827cda-f984-5b43-8f48-cfcc5a2093da | crew-01 | 26470175-2cbf-462c-939a-af0cf6798f75 | 13 | 12 |
| sim-crew-02 | dde88266-8305-53f5-947e-8e6d0ef20c6c | crew-02 | 50b7ae56-165e-4439-9ab6-f77c5da5c4d4 | 12 | 11 |
| sim-crew-03 | 26904e81-d975-5d15-8f4f-6af546ffe6d8 | crew-03 | 7cf22ae6-3d70-4342-8660-0986e06b406d | 12 | 11 |

The existing `DemoSimulationScopeProvisioningCommand` authenticated the capture
creator with hidden password input and created seven scopes and seven immutable
approval records: four static specialized definitions plus three capture-owned
radiation origins. Together with the five existing generic catalog scopes there
were 12 scopes. No scope guard, provenance guard or migration checksum was bypassed.

## Live defect and smallest fix

Initial ingestion and replay worked, but the authorized monitoring-rule API
returned 400 for a SYNTHETIC_DEMO heart-rate rule on the actual shared `default`
scope. The ingestion contract intentionally uses those five generic scopes for
both origins, while rule resolution had treated scope identity alone as source
classification. This made the real delivery path incompatible with demo alerts.

The source-aware fix is confined to `MonitoringRuleService` and
`HealthObservationEvaluator`: allow explicitly gated demo rules on the five
canonical shared defaults, select the demo/real channel using trusted persisted
observation provenance, keep supersession within that channel, and label alerts
from the observation's synthetic identity. Specialized real scopes remain
ineligible, synthetic scopes still reject real observations, and neither channel
falls back to the other. Baseline-relative demo rules remain forbidden. The public
selection API cannot supply the trusted discriminator. Invalid scope input retains
the existing safe 400 behavior. No schema change was necessary.

Focused PostgreSQL 17 regressions: **72 tests, zero failures/errors/skips**. This
includes the two new shared-scope source-isolation cases and existing engine/rule
coverage, plus invalid-scope validation.

## Execution and persistence

1. Three original heart-rate envelopes, one per mapped source, were ingested with
   evaluation disabled: HTTP 200, created 3, duplicates 0. Exact replay returned
   200, created 0, duplicates 3. Observations, scalar values and receipts stayed at
   three; no outbox rows were backfilled when evaluation was later enabled.
2. Three new heart-rate records were ingested after enabling only the disposable
   worker: three completed `MISSING_RULE` outcomes and zero alerts.
3. A bounded selection of 30 original observations covered all nine families and
   all 11 metrics for all three sources. Blood pressure preserved both components;
   grip and mass remained separate original observations/scopes. All three bone
   records were exactly **28 virtual days** after the actual run origin.
4. The authorized API created **33** labeled SYNTHETIC_DEMO rules (201 each), then
   explicitly activated them (204 each). Bounds were arbitrary nonclinical test
   assertions derived from the chosen synthetic fixture values to guarantee
   violations, with traceable local source references and officer approval notes.
   They were not clinical/NASA limits or personal baselines. Severity was explicitly
   configured, never inferred from deviation magnitude.
5. Ingesting the 30 originals returned 200/created 30. The worker generated 33
   synthetic alerts. Exact replay returned 200/created 0/duplicates 30.
6. An unseen backward cumulative-radiation observation returned 409
   `radiation_order_conflict`, with no persisted observation or receipt. A later
   original cumulative total returned 200/created 1 and generated one more alert.
   Stored dose remained the original mGy total in its capture/astronaut origin,
   not a sum or mSv conversion.
7. Every one of the **37** persisted original envelopes was compared with its
   Python export, including original source identity, target mapping, source record
   ID, sequence, timestamp and context. All matched. Backend identity enrichment did
   not rewrite the original envelope or infer baselines from simulator parameters.

Final counts, before cleanup:

| Record | Count |
|---|---:|
| Astronauts / accounts | 4 / 5 |
| Captures / mappings | 1 / 3 |
| Scopes / scope approval audit rows | 12 / 7 |
| Observations / ingestion receipts | 37 / 37 |
| Scalar measurements | 19 |
| Paired blood-pressure observations | 3 |
| Sleep sessions / mood assessments | 3 / 3 |
| Muscle assessments | 6 |
| Bone examinations | 3 |
| Demo rules / activation events | 33 / 33 |
| Outbox jobs, all completed, zero attempts/retries | 34 |
| Immutable metric outcomes | 43 |
| Synthetic alerts / evidence references | 34 / 34 |
| Alert audit events | 68 |
| Personal baselines / baseline proposals | 0 / 0 |
| ML assessments / evaluation failures / pending jobs | 0 / 0 / 0 |

Outcomes were exactly `ALERT_CREATED=34`, `MISSING_RULE=3`, and
`METRIC_UNAVAILABLE=6`. The latter are the absent optional counterpart of each
separate grip/mass observation; none generated an alert. Severity counts were
WARNING=19 and CRITICAL=15. Every alert had `is_synthetic=true`, nonclinical
provenance and `clinical_emergency=false`. There were zero clinical rules or alerts
and no ML invocation in this flow.

## Authenticated API and real browser results

| Operation | Actual result |
|---|---|
| Officer alert list | 200, 34 synthetic/nonclinical alerts |
| Maya / Tomas / Lena own lists | 200, respectively 12 / 11 / 11, all correctly scoped |
| All 34 alert details | 200; exact rule version 1, observation metadata, evaluation reference, no inferred baseline or unrestricted provenance |
| Officer CRITICAL + OPEN + RULE + synthetic filter | 200, 15 alerts |
| Bone / radiation indicator filters | 200, 3 / 4 alerts |
| Astronaut requests another astronaut's alert | 404 |
| Astronaut requests officer list | 403 |
| Anonymous alert detail | 401 |
| Acknowledgment without CSRF | 403 |
| Acknowledgment with valid CSRF for future virtual observation | 409, correct lifecycle-time guard; no historical evidence/audit mutation |
| Invalid scope UUID in rule selection | 400, safe validation |
| Exact allowed-origin browser CORS preflight | 200, exact origin and credentials allowed |
| Foreign-origin CORS preflight | 403 |

The installed Edge browser ran headlessly with a separate temporary profile. It
loaded the existing independent Simulation Lab and its actual `DeliveryClient`:
`signIn`, `freshBinding`, Python manifest retrieval, bounded original submission,
`validateAcknowledgement`, alert retrieval and `signOut` all used real HTTP.
The client replayed the same 30 original records: created 0, duplicates 30.
Browser JavaScript could not read JSESSIONID, neither password nor CSRF token was
persisted in localStorage, and logout was followed by an actual 401. No Origin
rewriting, CSRF exemption, wildcard CORS or permissive Spring proxy was used.
The complete automatic export/checkpoint scan was not used to ingest the other
retained source records; this test exercised bounded delivery explicitly.

The future-observation acknowledgment rejection is an expected safety outcome,
not a blocker. The test did not alter clocks, fabricate past observation timestamps
or relax lifecycle constraints to manufacture a successful transition.

## Cleanup and evidence

The owned Python, Spring Boot, Vite/esbuild, browser and operator processes were
shut down. The new container was stopped and automatically removed, destroying its
tmpfs database and temporary credentials. Ports **15432, 18080, 18765 and 5173**
were verified closed. All four pre-existing container objects retained their IDs,
start timestamps, mount definitions and port bindings. In particular, the existing
development PostgreSQL on **5433** was never connected to, migrated, provisioned,
stopped or deleted. No development/production records were touched by this run.

Generated evidence (synthetic only, no session secrets) is under
`backend/target/phase4c6c/`: actual manifest, capture, selected original export,
verified results, all 34 allowlisted alert details, browser request results,
target verifications and event log. Focused regression output is
`backend/target-phase4c6c-focused.log`. Generated launch scripts contain no embedded
passwords; runtime secrets existed only in the owning operator/child processes.

No frontend, ML, simulation source or V1–V35 migration was modified. No staging,
commit or push was performed. Automatic evaluation remains disabled by default
outside the stopped disposable process. There are no remaining integration
blockers. Work stops here before the Health Knowledge Hub.
