# Phase 4C.6C fresh disposable execution — 2026-11-15

The real Python API, authenticated Spring Boot ingestion, PostgreSQL 17 persistence,
evaluation worker and authenticated alert APIs completed a fresh live integration.
No application source fix or migration change was required. Work stops before the
Health Knowledge Hub.

## Isolation

The existing backup at
`C:\Users\augus\AppData\Local\Temp\AstroHealth-source-backup-20261115-024503-103`
was verified against its manifest: 302 files, zero hash mismatches.

The new container was `astrohealth-e2e-7b1488371030`, full ID
`f61ecff64b98293986af9e542815f29118054b61e5851be020703ba3fc84aabf`.
It used `postgres:17`, tmpfs data, automatic removal, private random temporary
credentials, no named volumes, and only `127.0.0.1:15432:5432` publication.
The exact JDBC URL was
`jdbc:postgresql://127.0.0.1:15432/astrohealth_e2e_7b1488371030`.
Container ID, unique label, storage, binding, database identity and PostgreSQL
version were checked before migration/provisioning; each demo rule operation also
verified its target. Flyway applied and validated exactly V1–V35.

The existing administrative commands used genuine hidden-input Java consoles.
They created five accounts, four fictional astronaut profiles, seven scopes and
seven scope approvals. Including existing generic definitions, there were 12 scopes.
Credentials were generated in memory and were not written into evidence or arguments.

Spring Boot bound to `127.0.0.1:18080`; the existing Python API bound to
`127.0.0.1:18765`. Only the disposable backend process enabled capture registration
and, after the initial ingestion, evaluation and demo rules. The local HTTP cookie
setting was process-local; HttpOnly, SameSite, authentication, CSRF and CORS remained
enabled. No frontend or ML process was launched.

## Manifest and mapping

The actual Python `GET /api/manifest` returned 200. Workspace:
`c5a7f680-72ef-40a4-a2ee-1776fcb5ff91`; run:
`67b807a7-41cc-5258-8844-94331dd02110`.
The complete manifest registered with HTTP 201 as ACTIVE capture
`60eebe09-b1ef-4306-b47a-1152bb20ff37`.

| Source UUID | Backend crew | Backend UUID | Alerts |
|---|---|---|---:|
| ca827cda-f984-5b43-8f48-cfcc5a2093da | crew-01 | 39a23e8d-39ad-48cc-81e1-408294d76513 | 11 |
| dde88266-8305-53f5-947e-8e6d0ef20c6c | crew-02 | c5141586-3186-4c99-9b8d-459c951778ff | 11 |
| 26904e81-d975-5d15-8f4f-6af546ffe6d8 | crew-03 | 5bf3ff81-e053-42fd-a738-ab1ff6b949c0 | 12 |

## Live outcomes

1. Three original heart-rate observations, one per source: HTTP 200, created 3,
   duplicates 0. Exact replay: HTTP 200, created 0, duplicates 3. Observation,
   scalar-measurement and receipt counts stayed at 3. Evaluation was disabled and
   there were no outbox jobs for these records.
2. With evaluation enabled, three new heart-rate originals produced three completed
   `MISSING_RULE` outcomes and zero alerts. Enabling the worker did not backfill
   the earlier observations.
3. A bounded selection of 30 untouched Python originals covered all nine families
   and 11 metrics across all three mapped sources. The engine retained 15,252
   observations, but only 37 were ingested. All three bone observations were at
   the original 28-virtual-day cadence. Grip and mass were distinct original records.
   Both blood-pressure components were preserved.
4. Authenticated rule creation returned 201 for 33 explicitly labeled SYNTHETIC_DEMO
   rules; explicit activation returned 204 for all 33. Bounds were arbitrary
   fixture assertions, with local source references and nonclinical approval notes.
   They were not clinical or NASA-approved thresholds. No baseline was inferred.
5. Ingestion of the 30 originals returned 200/created 30 and produced 33 alerts.
   Exact replay returned 200/created 0/duplicates 30, without additional alerts.
6. One later original cumulative-radiation total returned 200/created 1 and
   produced one further alert. Original stored mGy totals were compared directly
   with the export, without summation or mSv conversion.
7. All 37 original envelopes, source identities, exact source-to-backend mappings,
   receipt sequences, timestamps, contexts and subtype values were verified against
   the live Python export, including the expected database numeric precision.

The simulator used an explicit future virtual origin, `2026-11-15T09:25:00Z`, so
prospective approvals could precede generated observations without backdating rules,
changing backend clocks or rewriting original records. Cadences were not shortened.

## Exact final persistence

| Record | Count |
|---|---:|
| Astronauts / accounts | 4 / 5 |
| Captures / mappings | 1 / 3 |
| Comparison scopes / approval rows | 12 / 7 |
| Observations / ingestion receipts | 37 / 37 |
| Scalar measurements | 19 |
| Paired blood-pressure records | 3 |
| Sleep sessions / mood assessments | 3 / 3 |
| Muscle assessments / bone examinations | 6 / 3 |
| Demo rules / activation events | 33 / 33 |
| Completed evaluation outbox jobs | 34 |
| Immutable metric outcomes | 43 |
| Synthetic alerts / evidence references | 34 / 34 |
| Alert audit events | 68 |
| Personal baselines / baseline proposals | 0 / 0 |
| ML assessments / evaluation failures / pending jobs | 0 / 0 / 0 |

Outcomes: `ALERT_CREATED=34`, `MISSING_RULE=3`, `METRIC_UNAVAILABLE=6`.
The six unavailable metrics are the absent optional counterparts in the separate
grip/mass records. Severity was explicitly assigned: WARNING=18, CRITICAL=16.
All jobs completed without attempts/retries. Every alert was synthetic; there were
no clinical rules or clinical-emergency outcomes. The ingestion/evaluation path has
no ML inference call, no ML service was launched, and no ML assessment was persisted.

## HTTP and security checks

| Operation | Result |
|---|---|
| Officer list | 200, 34 synthetic/nonclinical alerts |
| All officer alert details | 34 × 200; rule version 1, evaluation reference, no baseline |
| Authenticated astronaut own lists | 200 each; crew-01=11, crew-02=11, crew-03=12 |
| Each astronaut accessing another crew member's alert | 404 |
| Each astronaut accessing officer list | 403 |
| Anonymous alert detail | 401 |
| Acknowledge without CSRF | 403 |
| Valid-CSRF acknowledgment of future virtual observation | 409, lifecycle-time guard |
| Allowed-origin preflight (`http://localhost:3000`) | 200, exact origin and credentials |
| Foreign-origin preflight | 403 |

## Operator corrections and evidence limitations

The runner was corrected to resume a paused simulator before advancing time, and
to use a nonnegative synthetic radiation assertion after the API correctly rejected
a negative bound. Completed migration, identity provisioning and ingestion were
not repeated. Application safeguards were not relaxed.

After all authenticated HTTP assertions and the first complete record comparison
had passed, the operator's final-report query incorrectly treated
`clinical_emergency` as a table column. The flag is an evaluation-details field.
A variable collision in the exception handler then ended the operator. The database
and child processes remained available. A separate read-only recovery verified all
37 originals and subtypes again, collected final counts, checked the actual details
field, and verified CORS. No integration restart or application modification was needed.

The in-memory per-request HTTP ledger and alert-detail response copies were lost
with that operator. The report identifies the authenticated checks that completed
before the traceback boundary rather than claiming fresh saved response bodies.
The machine-readable summary explicitly records this evidence limitation.
The previous 288-test suite was not rerun; this execution used live HTTP/database
assertions and a successful backend compilation. There are no remaining integration
blockers.

Evidence is in `backend/target/phase4c6c-fresh/`: actual manifest, ACTIVE capture,
bounded original export, target-check events, process logs, recovered
`verified-results.json`, and preserved existing container identities.

## Cleanup and scope

Only the verified owned Python PID 7220, backend PID 7428 and disposable container
were stopped. The container automatically removed its tmpfs database. Ports 15432,
18080 and 18765 were verified closed. The four pre-existing container IDs remain
and their start times predate this run. Development PostgreSQL on 5433 was never
connected to, migrated, provisioned, stopped or deleted. No development or production
records were changed. No existing volume was reused or removed.

This run added only generated operator/evidence files under `backend/target` and
this report. No frontend, ML, application source, or V1–V35 migration was modified.
Nothing was staged, committed or pushed. Evaluation remains disabled by default
outside the now-stopped disposable process.
