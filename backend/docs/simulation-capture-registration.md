# Simulation capture registration — Phase 4C.3A

This API approves identities for a synthetic capture. It does not fetch Python data,
create astronauts/accounts/scopes, or generate alerts. Phase 4C.3B adds a separate
[observation ingestion endpoint](synthetic-observation-ingestion.md) under the same gate. All
operations require the existing authenticated, enabled NASA_OFFICER session. Only
the creator may read or close a capture. Account role/enabled state is reloaded and
locked inside the service transaction, including for direct service calls.

## Explicit opt-in

The feature is disabled by default in every environment. Both settings are required:

```text
ASTROHEALTH_ENV=development                 # or demo
SIMULATION_CAPTURE_REGISTRATION_ENABLED=true
```

These map to `astrohealth.environment` and
`astrohealth.simulation.capture-registration-enabled`. A production or unspecified
environment is refused even if the flag is true. These instructions do not authorize
starting the backend against, migrating, or provisioning the development database.

The API uses the existing session cookie and CSRF flow (`GET /api/auth/csrf`, login,
then obtain a fresh CSRF token). Send `Content-Type: application/json` and the token
in `X-CSRF-TOKEN` for POST requests. Do not transfer officer credentials/session
cookies to Python. No CORS origins or CSRF exemptions have been added. The independent
Simulation Lab is not connected by this phase.

## Register

`POST /api/simulation/captures`

```json
{
  "registrationKey": "d30e9e38-7874-4452-bb9e-6f85b41fb819",
  "workspaceId": "42c3c89a-0ef3-495e-962a-1c4397a93b01",
  "runId": "14721900-a8d9-5b83-96c7-4822526c1cf8",
  "manifest": {
    "schema_version": "astrohealth.simulation.run.v1",
    "engine_version": "0.1.0",
    "synthetic": true,
    "run_id": "14721900-a8d9-5b83-96c7-4822526c1cf8",
    "configuration": {
      "seed": 42,
      "start_at": "2026-01-01T08:00:00Z",
      "profiles": [
        {
          "astronaut_id": "11b13c9b-c97c-47bf-b06c-47f3442ab335",
          "crew_code": "sim-crew-01"
        }
      ]
    }
  },
  "mappings": [
    {
      "simulationAstronautId": "11b13c9b-c97c-47bf-b06c-47f3442ab335",
      "simulationCrewCode": "sim-crew-01",
      "targetCrewCode": "crew-01"
    }
  ]
}
```

The sample uses illustrative UUIDs and a minimal registration configuration. For a
real approved capture, supply the actual engine `manifest()` output with its full
configuration, the API workspace UUID from its state/export page, and the intended
subset of profiles. The run manifest currently comes from the engine contract,
not a new Python manifest endpoint. Run IDs are deterministic engine identities;
workspace IDs distinguish API process restarts. Both are required and nonzero.

The service validates the schema version, synthetic flag, matching run IDs,
nonblank engine version, integer seed, UTC/offset timestamp, and unique source
profile UUID/code pairs in `configuration.profiles`. Up to four mappings must match
those pairs exactly. Destination codes are restricted to `crew-01`–`crew-04` and
resolved to actual existing, active backend astronaut UUIDs under lock. Source
UUIDs, source codes, and destination codes must each be unique in the mapping list.
Names never resolve identities, and a destination needs no linked login account.

Configuration is retained as immutable synthetic provenance, not interpreted as
medical parameters or persisted as baselines/thresholds. The serialized approval
is limited to 256 KiB and the source roster to 64 profiles. Unknown top-level, manifest,
and mapping request fields (including role, creator, or destination UUID assertions)
are rejected. Configuration remains an extensible provenance object. Registration
does not authenticate a remote Python source: the officer explicitly approves the
submitted workspace/run manifest and identity pairs. It never infers a trusted
destination merely because Python is local.

A new registration returns `201 Created` with `Location: /api/simulation/captures/{id}`:

```json
{
  "captureId": "3414095a-b67b-4d36-b21a-ea4cb37c2967",
  "workspaceId": "42c3c89a-0ef3-495e-962a-1c4397a93b01",
  "runId": "14721900-a8d9-5b83-96c7-4822526c1cf8",
  "createdByAccountId": "cce67bc3-7658-47cf-a3d7-2f533684df01",
  "status": "ACTIVE",
  "createdAt": "2026-11-14T23:00:00Z",
  "activatedAt": "2026-11-14T23:00:00Z",
  "closedAt": null,
  "mappings": [
    {
      "mappingId": "ff14992f-a812-4711-831a-ea836dd717f3",
      "simulationAstronautId": "11b13c9b-c97c-47bf-b06c-47f3442ab335",
      "simulationCrewCode": "sim-crew-01",
      "astronautId": "b04d75b5-a1a5-46f9-bcb0-24bdd3253841",
      "targetCrewCode": "crew-01",
      "createdAt": "2026-11-14T23:00:00Z"
    }
  ]
}
```

All response UUIDs/timestamps are illustrative; actual destination and audit IDs
come from the database and the server's authenticated account, never the request.

## Lifecycle and retries

Registration saves DRAFT, inserts and flushes all approved mappings, then activates,
in one transaction. An error rolls everything back; no partially approved draft is
committed. V31 forbids mapping updates/deletes even in DRAFT and forbids adding
mappings after activation. No mapping edit or separate activation endpoint exists.

`GET /api/simulation/captures/{id}` returns the same response shape for its creator.
`POST /api/simulation/captures/{id}/close` requires CSRF and this identity body:

```json
{
  "workspaceId": "42c3c89a-0ef3-495e-962a-1c4397a93b01",
  "runId": "14721900-a8d9-5b83-96c7-4822526c1cf8"
}
```

Close returns `200` with CLOSED status and closure time. Repeated close preserves the
original timestamp. CLOSED cannot reactivate; historical registrations remain readable.

The required UUID `registrationKey` is scoped to the creator across all their runs.
An exact retry returns `200` and the original capture (including CLOSED); it does not
revalidate current destination availability or create anything. Changed content with
the same key returns `409`. Approval equality uses PostgreSQL JSONB equality, with
mappings sorted by source UUID; object key order and numeric formatting do not matter.
Other array order remains significant.

A fresh key permits an identical independent capture for the same creator/workspace/run,
as allowed by V31. Different manifest/mappings for an already registered workspace/run,
or registration of that workspace/run by a different officer, returns `409`. To use a
different approved mapping, register a new engine run/workspace. A transaction-scoped
advisory lock serializes service registrations, including concurrent first insert/key
reuse. Keys and original approvals live in the immutable V31 manifest; no schema change
or global workspace/run uniqueness constraint was added. These guarantees apply to
this service; direct database writers remain trusted and must not bypass the API.

Audit information consists of the immutable creator, run/workspace, full approved
manifest, resolved mappings, and database creation timestamps, plus server activation
and closure timestamps. Closing is creator-only, so no second closure actor is inferred.

## Errors and validation

Errors use the existing `{"error":"..."}` shape without SQL, credentials, or manifest
contents. `401` means unauthenticated/disabled session; `403` means wrong role, missing
CSRF, or disabled/environment-ineligible feature. `400` means malformed identity,
manifest, duplicate mapping, source substitution, or unapproved destination. `404`
means missing destination or missing/inaccessible capture. `409` means archived
destination, conflicting approval/key, mismatched close identity, or lifecycle conflict.
Storage unavailability returns `503`. A missing-CSRF POST can return `403` before
authentication, following the existing security filter order.

Integration tests use PostgreSQL 17 Testcontainers only:

```powershell
.\mvnw.cmd -B '-Dtest=SimulationCaptureRegistrationTests,SimulationCaptureDisabledTests,SimulationCaptureProductionGateTests,SimulationPersistenceTests' test
.\mvnw.cmd -B test
```

Capture registration itself does not write observations or receipts. Observation ingestion
is documented separately above; thresholds, baseline configuration, alerts, frontend
synchronization, live database migration, and actual account provisioning remain excluded.
