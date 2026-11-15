# Personal baselines — Phase 4D.1

Personal references are user-supplied values, distinct from clinical limits. This phase does not create reference values, clinical bounds, thresholds, alerts, frontend changes or simulation/ML integrations. V33 adds proposal/approval infrastructure only. Existing V1–V32 migrations remain byte-for-byte unchanged. Deploying V33 requires a separate deployment operation; development database migration was not performed.

## Authorization and workflow

An enabled NASA officer proposes a baseline for an active astronaut. A **different enabled NASA officer** approves it with a nonblank review note. Approval is an administrative authorization under the existing roles, not a claim of medical certification. Creation and approval recheck persisted identities inside the service, including calls that bypass HTTP security. Astronauts may read only their own proposals and versions; officers may read any astronaut's history. Archived astronauts retain history, but cannot receive new proposals or approvals. Disabled accounts cannot read or write.

Both write operations require the existing authenticated session and CSRF token. Reference values and supporting observation IDs are supplied in request bodies. Error messages do not disclose reference values or evidence.

| Method | Route under `/api/crew/{astronautId}/baselines` | Result |
| --- | --- | --- |
| POST | root | 201 `{ "proposalId": "UUID" }`; immutable pending proposal |
| POST | `/{proposalId}/approve` | `{ "baselineId": "UUID" }`; independent officer approves with `{ "note": "review note" }` |
| GET | root | Proposal history, original request snapshot, creator, creation time and approval details |
| GET | `/versions` | All stored versions, including legacy unapproved rows, their provenance and approval details |
| GET | `/selection` | Approved reference selection or explicit `MISSING` result |

Proposal body fields: `indicatorCode`, `metricCode`, `unit`, `activityContext`, `comparisonScopeId`, `baselineKind` (`ORIGINAL` or `ROLLING`), `referenceValue`, `effectiveFrom`, optional `effectiveTo`, `inputFrom`, `inputTo`, `method`, `sourceName`, `observationIds`, optional paired `supersedesBaselineId` and `correctionReason`. Clinical lower/upper bounds are not supported by this workflow. No request example supplies an actual astronaut reference value.

At least one distinct real observation is required (maximum 1,000 per proposal). Sample count is the number of cited observations. Each must belong to the astronaut, match the indicator, selected metric, exact scope and context, fall inside the input window, contain its typed value and have no existing correction. Simulated observations/check-ins, simulation-audited scopes and metadata with synthetic/simulation markers are rejected. The reviewer must establish source authenticity; the backend cannot detect real-world data that an upstream source has falsely labelled. A simulation parameter or manifest cannot serve as evidence. There is no ingestion path from simulation configuration to baselines.

Canonical units come from `indicator_metrics`; conversion is not performed. Scope UUIDs retain body site, protocol/version, scale/version and personal radiation accumulation origin. Radiation scopes must belong to the astronaut. Grip force (`kgf`) is distinct from muscle mass (`kg`); absorbed dose (`mGy`) is distinct from equivalent dose (`mSv`). Mood references respect the registered scale. Existing storage-domain constraints apply; no clinical limit is inferred.

Times use ISO-8601 UTC, at most microsecond precision, years 0001–9999. Input windows are inclusive, cannot end in the future and must end no later than the effective start. Effective periods are half-open `[from,to)`. Approval revalidates the entire proposal; effective start must still be in the future or present. Delayed proposals that have become retroactive must be replaced with a new proposal. This prevents changing previously available comparisons.

## Selection and versions

Selection query parameters are `indicator`, `metric`, `unit`, `context`, `scope` (UUID), `at` (instant). Astronaut, indicator, metric, unit, scope and context must match exactly. All catalog-supported contexts work: `RESTING`, `SLEEPING`, `EXERCISING`, `OTHER`, `UNKNOWN`. `UNKNOWN` is not a wildcard. There is no cross-context or cross-scope fallback.

Among approved versions covering `at`, ROLLING takes precedence over ORIGINAL. If the rolling period has expired, the covering original may be used. No matching approved version returns HTTP 200 with `status: MISSING`, null baseline fields and the requested unit. It does not manufacture a normal value. An invalid dimension/unit/scope returns 400. Conflicting versions return 409 rather than silently choosing one. Legacy rows without explicit approvals remain visible under `/versions` but are excluded from selection.

Every later version must explicitly link the latest version in the same series and provide a reason. Approval closes an open predecessor at the new effective start, or checks that an already closed predecessor does not overlap. Approval and closure are one transaction. Astronaut row locks serialize concurrent writers; a competing stale proposal receives 409. The database also rejects overlapping series periods. Different kinds may coexist to support the documented precedence.

V26 preserves baseline contents and permits only one-time validity closure. V33 protects proposals and approvals against update/delete/truncate, verifies the approved value and dimensions against the original snapshot, and records immutable source observation UUIDs plus creator/approver account UUIDs. Retrying a completed approval by an authorized independent officer returns the same baseline ID. History keeps the original open-ended proposal even after a successor closes its baseline period. No delete/edit endpoint exists.

## Validation

Tests inherit `PostgreSqlIntegrationTest`: disposable `postgres:17`, no reusable volume, dynamic datasource/Flyway URLs, Compose disabled, and no development database fallback. Focused tests cover contexts, authorization/ownership, CSRF, provenance, independent approval, precedence, missing results, unit and radiation scope validation, conflicts/concurrent approvals, history and immutable database records. Test numbers are fictional fixtures only.

Commands from `backend/`:

```text
.\mvnw.cmd -Dtest=AccountSchemaTests,PersonalBaselineTests,PersonalBaselineControllerTests test
.\mvnw.cmd test
```

Stop for review after Phase 4D.1; monitoring thresholds and alert generation belong to later phases.

### Actual verification — 2026-11-15

- Focused command above: **36 tests, 0 failures, 0 errors, 0 skipped**, Maven exit 0. Includes four schema tests and 32 baseline service/HTTP cases.
- Full backend suite: **170 tests, 0 failures, 0 errors, 0 skipped**, Maven exit 0; completed at 03:09:48 UTC in 2:45. PostgreSQL container reported version 17.12.
- The first full run found two outdated schema assertions (expected V32 and three upgrades after V29). Updating expectations for V33 corrected them; focused and full suites then passed.
- Local output: `backend/target-phase4d1-focused.log` and `backend/target-phase4d1-full.log`; detailed JUnit reports in `backend/target/surefire-reports/`. These are local build artifacts.
- Before implementation, copied and verified 302 files (2,058,995 bytes) to `C:\Users\augus\AppData\Local\Temp\AstroHealth-source-backup-20261115-024503-103`, outside the repository. `SHA256-MANIFEST.json` records each relative path, byte length and SHA-256. All 302 backup hashes were verified again after implementation with zero mismatches.
- Backup excludes Git internals, dependencies, build output, caches, temporary files, logs and credential-named files. Application datasource credentials use environment placeholders.
- Against the source backup, the only existing source files changed are `SecurityConfig.java` and `AccountSchemaTests.java`. All 32 original migrations and all backed-up frontend/ML/simulation files retain their hashes (196 protected files checked). No development database connection/migration or Git staging/commit/push/reset/clean operation was performed.

## Files changed

All paths below are relative to `backend/`.

| File | Change |
| --- | --- |
| `src/main/resources/db/migration/V33__personal_baseline_approvals.sql` | New proposal/approval tables, audit protection and overlap guard |
| `src/main/java/com/augustine/nasa_space_app_backend/dto/BaselineRequest.java` | New validated proposal contract |
| `src/main/java/com/augustine/nasa_space_app_backend/service/PersonalBaselineService.java` | New authorization, validation, approval, history and selection workflow |
| `src/main/java/com/augustine/nasa_space_app_backend/service/BaselineException.java` | New safe baseline errors |
| `src/main/java/com/augustine/nasa_space_app_backend/controller/PersonalBaselineController.java` | New authenticated proposal/approval/history/selection endpoints |
| `src/main/java/com/augustine/nasa_space_app_backend/controller/PersonalBaselineExceptionHandler.java` | New HTTP error mapping |
| `src/main/java/com/augustine/nasa_space_app_backend/security/SecurityConfig.java` | Allow only the explicit baseline routes under existing role/session/CSRF security |
| `src/test/java/com/augustine/nasa_space_app_backend/PersonalBaselineTests.java` | New PostgreSQL service, scope, version, provenance and concurrent-approval tests |
| `src/test/java/com/augustine/nasa_space_app_backend/PersonalBaselineControllerTests.java` | New HTTP authorization/CSRF and workflow tests |
| `src/test/java/com/augustine/nasa_space_app_backend/AccountSchemaTests.java` | Update expected latest schema to V33, applied count to 33, and V29 upgrade count to four |
| `docs/personal-baselines-phase4d1.md` | This implementation and review record |
