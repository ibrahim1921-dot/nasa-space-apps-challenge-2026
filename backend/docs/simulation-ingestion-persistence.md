# Simulation ingestion persistence — Phase 4C.2

V31 is the persistence foundation. Phase 4C.3A now adds explicitly gated capture
registration; see [simulation-capture-registration.md](simulation-capture-registration.md).
Phase 4C.3B adds [secure observation ingestion](synthetic-observation-ingestion.md),
without startup provisioning or simulator credentials. Existing session/CSRF
authentication and deny-by-default routing remain.

## Identity and registration

`DemoAccountProvisioner` defines the intended existing fictional destinations:

| Stable backend crew code | Provisioner display name | Account login |
| --- | --- | --- |
| crew-01 | Maya Okafor | maya.demo |
| crew-02 | Tomas Reyes | tomas.demo |
| crew-03 | Lena Kowalski | lena.demo |
| crew-04 | Kwame Asante | kwame.demo |

This is repository evidence, not confirmation that these records exist in a database.
V31 inserts none of them. The independent simulator currently exports three fictional
profiles; there is no requirement to map all four destinations into every capture.
Names are never identity evidence. No duplicate astronaut/account entities are added.

The future registration service must reload the authenticated account, require an
enabled NASA_OFFICER and explicit development-mode authorization, and resolve selected
crew codes to existing, active astronaut UUIDs. Missing profiles are a registration
error, not a reason to create them. Each fictional UUID and crew code must be explicitly
approved against the exported profile; do not infer UUIDs from names or interchange
crew codes with UUIDs. Record approval using the server's account identity, never a
client-supplied creator. Database checks supplement, but do not authenticate, that actor.

Register a DRAFT capture, insert mappings, flush, then activate, all in one transaction.
Mappings are immutable immediately and cannot be added after activation. An incorrect
mapping requires a new capture; unused drafts are retained rather than rewritten.
The database permits DRAFT -> ACTIVE (with at least one mapping) -> CLOSED only.
Closing is terminal. Service code should handle repeated close requests without issuing
another update. A closed capture can still be queried for historical retry receipts.

## V31 tables

- `simulation_captures`: database-generated UUID; simulator workspace UUID; engine run
  UUID; creator account FK; DRAFT/ACTIVE/CLOSED status; immutable JSONB run manifest;
  creation, activation and closure timestamps; optimistic-lock version. One capture
  binds one engine run in one workspace. No unique workspace/run constraint prevents
  legitimate independent captures. Run manifest content must be validated by the future
  service, including schema version, run identity, configuration and synthetic flag.
- `simulation_profile_mappings`: UUID; capture FK; fictional astronaut UUID and crew
  code; resolved backend astronaut UUID; backend crew-code snapshot; creation timestamp.
  Fictional UUID, fictional crew code and destination UUID are each unique within a
  capture. A database check limits destinations to crew-01..crew-04; an insertion trigger
  verifies the stored UUID actually belongs to the selected active crew code. No account
  is created or required on the destination by this schema.
- `simulation_ingestion_receipts`: UUID; capture FK; mapping FK; destination UUID;
  source record ID; positive workspace export sequence; lowercase 64-character SHA-256
  payload digest; nonblank canonicalization version; resulting observation UUID;
  receipt creation timestamp. `(capture_id, source_record_id)` and
  `(capture_id, export_sequence)` are unique. An observation belongs to at most one
  receipt. Separate captures may ingest the same source ID into separate observations.

Composite FKs enforce that a receipt uses its capture's mapping and the observation's
actual astronaut. A trigger also verifies SIMULATION source, source record ID, engine
run ID and workspace ID against the referenced observation. The future service must
add the trusted `workspace_id` to `health_observations.simulation_metadata`; original
envelopes currently carry run identity but not workspace identity inside that object.
The original fictional identity and capture ID should also remain in metadata/provenance.

FKs use RESTRICT. Mapping/receipt updates and deletes, capture deletes, and truncation
of all three tables are blocked. Capture identity, creator and manifest cannot change.
Only capture lifecycle/version fields can change. Owners/superusers remain trusted;
runtime DB privileges must exclude DDL and trigger disabling. These are not tamper-proof
audit records against a privileged database administrator.

## Transactional idempotency for Phase 4C.3

1. Authorize the current officer at service and HTTP layers. Lock the capture using
   `findLockedById` inside a write transaction; verify supplied workspace/run identity.
2. Resolve the immutable mapping and check the destination is still active. Validate the
   full raw envelope, approved scopes, unit/context/catalog compatibility and timestamp
   semantics. Do not trust the exported `value_table` as a dynamic SQL identifier.
3. Compute a SHA-256 digest using a documented versioned canonicalization algorithm.
   Specify numeric normalization, object key order, array order and included fields
   before implementing it; do not hash arbitrary JSON serializer output. This phase
   stores the digest/version but does not claim to implement canonicalization.
   Include all original envelope content and bind it to the capture/mapping. Transport
   page counters are not measurement content. A hash detects conflicting content,
   not source authenticity.
4. Look up `(capture_id, source_record_id)`. Matching digest, canonicalization version,
   mapping and sequence means duplicate: return the original observation UUID. Any
   mismatch is a conflict; never overwrite a receipt or historical measurement.
   Inspect existing receipts before rejecting a closed capture so completed retries
   can be recognized; no new receipts may be inserted into closed captures.
5. For a new record, require ACTIVE, insert the observation header and correct subtype,
   then the completed receipt, in the same transaction. There is intentionally no
   nullable/reserved receipt state. Roll back the whole transaction on failure.
   V25's deferred completeness constraint still runs at commit. Do not catch a unique
   violation and continue in a PostgreSQL transaction already marked failed: either
   serialize using the capture lock or retry/read in a fresh transaction.

Receipt insertion and mapping insertion lock their capture against concurrent lifecycle
changes. Taking that lock first in the service keeps lock ordering consistent and
serializes writers per capture. The database unique keys remain the final safeguard.
The receipt does not automatically compute/validate the digest against stored clinical
values; the service owns canonicalization and full envelope validation.

The export API's sequence spans profiles and runs within one workspace. A capture is
run-specific, so its sequences can have gaps; do not interpret maximum receipt sequence
as proof that every earlier export item has been processed. Client export checkpoints
and ingestion receipts have different responsibilities.

## Workspace restarts and reset

Reset preserves Python history but creates another run/origin: register a separate
capture for that run. API restart loses its unexported history and generates a new
workspace UUID: register a new capture, even if deterministic engine run/source IDs
repeat. Existing captures and receipts remain durable in PostgreSQL. They cannot recover
Python observations that were never exported/ingested. No global source-ID uniqueness
or workspace/run uniqueness blocks independent experiments.

## Scope and medical configuration still required

The future authorized development provisioning step must approve and resolve existing
scope UUIDs for the synthetic mood scale (1–5), separate grip/mass protocols and sites,
bone protocol/site, and per-destination radiation origin/method. Radiation origins
should distinguish independent captures; V25 requires their real backend astronaut
owner. Five generic default scopes exist in V22, but specialized ones are not seeded.
Missing scopes must yield an explicit error, never silent fallback or automatic creation.

No scopes, measured baselines, monitoring rules, thresholds or alert records are seeded.
Synthetic numeric mood is not an astronaut-submitted assessment. Simulator baseline
parameters remain provenance, not `personal_baselines` records. Future ingestion must
retain synthetic source markings and keep simulated data out of real medical analysis.

## Safe validation and deployment

`SimulationPersistenceTests` uses the existing PostgreSQL 17 Testcontainers base with
explicit datasource AND Flyway URL overrides, `ddl-auto=validate` and clean disabled.
It tests JPA mappings, constraints, lifecycle, atomic rollback, independent captures,
upgrade from V30 and concurrent receipt uniqueness. Its medical rows are disposable
test fixtures only. Run from `backend/` using the Maven wrapper:

```powershell
.\mvnw.cmd test
```

Do not start the application against the development database merely to test this
migration: startup Flyway would apply pending migrations. Applying V30/V31 there still
requires separate approval, a backup and review of pending migrations. No live demo
provisioning or migration is part of this phase.

### Provisioning compatibility

Phase 4C.2.1 corrected the exact-V30 compatibility guard. The provisioner now requires
successful V30 and validates the applied migration history, accepting verified V30
and V31. It does not apply migrations. Capture registration still fails if selected
demo profiles do not exist and never invokes the provisioner.
