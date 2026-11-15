# Controlled demo comparison scope provisioning — Phase 4C.4

Technical comparison scopes describe which measurements are comparable: scale, site,
protocol, units and accumulation origin. They are not personal reference values or
clinical decision thresholds. This phase inserts no personal baselines, monitoring
rules, observations, alerts, accounts or astronauts.

## Choice: explicit command, audit-only migration

Use the separate interactive `DemoSimulationScopeProvisioningCommand` after a capture
has been registered. Static definitions could be seeded through a migration, but that
would create demo definitions automatically in every migrated environment. This command
keeps all scope creation behind a deliberate local-development administrative action.
It accepts a capture UUID, never a JSON scope descriptor or incoming measurement payload.

V32, `V32__create_simulation_scope_provisioning_audit.sql`, adds append-only audit
infrastructure only. V7 already has all scope dimensions, but only records a creation
timestamp, not who approved a scope for a capture. V32 records the authenticated
officer, capture, optional radiation mapping, scope UUID, exact definition snapshot,
metric/unit, definition version, database actor, invocation UUID, timestamp and
CREATED/VERIFIED action. It seeds nothing and does not alter V1–V31.

Applying V32 to any development database is a separate, explicitly approved migration
operation. It has only been applied in disposable PostgreSQL 17 Testcontainers here.
The command inspects/validates migration history through at least V32; it never migrates,
repairs, baselines, cleans, creates schemas, or launches Spring Boot/HTTP. Missing,
failed, incomplete, unknown or checksum-invalid history is refused.

## Fixed version 1 definitions

| Scope | Meaning | Metric and canonical unit | Scope lifetime |
| --- | --- | --- | --- |
| `simulation-mood-v1` | SYNTHETIC_DEMO_MOOD scale, version 1, scores 1–5 | score / score | Shared static definition |
| `simulation-grip_strength-v1` | DOMINANT_HAND, SYNTHETIC_DEMO_GRIP protocol version 1 | grip_strength / kgf | Shared static definition |
| `simulation-muscle_mass-v1` | WHOLE_BODY, SYNTHETIC_DEMO_MUSCLE_MASS protocol version 1 | muscle_mass / kg | Shared static definition |
| `simulation-bone-v1` | LUMBAR_SPINE, SYNTHETIC_DEMO_AREAL_DENSITY protocol version 1 | areal_density / g/cm2 | Shared static definition |
| `simulation-capture-<captureUUID>-<backendAstronautUUID>` | WHOLE_BODY personal accumulation since the immutable registered run start, SYNTHETIC_DEMO_ABSORBED_DOSE method | value / mGy | One capture/destination |

These match the read-only Python engine/export contract. Units remain in the existing
indicator catalog, not a new scope column, and are verified before insertion. Mood
bounds identify the demonstration scale; they do not classify medical risk. Numeric
mood remains explicitly demonstration-only, not an astronaut-submitted assessment.
Grip force in kgf is distinct from muscle mass in kg. Absorbed dose in mGy is distinct
from environmental readings or equivalent/effective dose in mSv.

The shared `SimulationScopeDefinitions` catalog prevents drift between provisioning
and `SimulationScopeResolver`. All approvals use definition version
`astrohealth.simulation.scopes.v1`. Radiation retains its existing export-compatible
dosimetry label; the approval ledger records its version instead of inventing a new
unrecognized scope dimension.

The five V22 `default` scopes are preserved byte-for-byte with their existing UUIDs.
The command provisions the four static definitions and one radiation definition for
each approved mapping of the selected capture. It does not require all four fictional
profiles to exist: only mapped destinations are needed. Static definitions are shared
across captures; radiation definitions and their origins are never shared between captures,
even if workspace/run/source IDs repeat. An already registered matching static scope
can be used by the resolver; radiation still requires its own capture-specific approval.

## Security and prerequisites

All of these are mandatory:

- `ASTROHEALTH_ENV=development` exactly. This administrative command is intentionally
  narrower than the HTTP development/demo gate; `demo` and `production` are refused.
- `SIMULATION_CAPTURE_REGISTRATION_ENABLED=true` and the additional
  `SIMULATION_SCOPE_PROVISIONING_ENABLED=true`. Missing flags default to disabled.
- Exact arguments `--provision-simulation-scopes --capture=<canonical nonzero UUID>`.
  No arbitrary destination, scope metadata, origin, role, or force/overwrite argument exists.
- Explicit DB_URL/DB_USER/DB_PASSWORD for a loopback PostgreSQL URL: localhost,
  127.0.0.1, or [::1], without URL credentials, options, or fragments. This is an
  accident-prevention guard; the operator must still verify the intended database.
- An interactive Java console, with hidden officer password input. Piped input and
  IDE consoles lacking System.console() are refused. No officer passwords go in
  arguments, environment variables, logs, audit records or Python.
- Validated applied migrations through V32 and the existing canonical catalogs.
- An existing enabled NASA_OFFICER authenticated against the existing BCrypt hash.
  Role assertions alone are insufficient. The officer must be the ACTIVE capture's
  actual creator; closed/draft/unknown/other-owner captures are refused.
- A verified synthetic registration manifest, matching workspace/run/source identities,
  complete approved mapping snapshot and a finite microsecond-precision registered origin.
- Existing active backend astronauts whose immutable UUID/code pairs match the capture's
  mappings and whose codes are restricted to crew-01, crew-02, crew-03 and crew-04.

No missing profile/account/mapping is inferred or created. Names do not resolve identity.
The command authenticates locally; it does not create an HTTP session, expose a new API,
change CORS, or exempt any existing operation from CSRF. It is not a Spring component,
startup runner or schedule. The ingestion resolver remains read-only and never calls it.

## Atomicity, conflicts and audit

The helper uses one 60-second transaction. It locks the officer account and capture,
coordinates with registration's advisory lock before locking selected destinations,
then serializes shared scope creation with its own advisory lock.
New definitions are inserted only from fixed constants and immutable registration data.
Matching existing definitions are reused without updating any field or UUID; every
dimension, including unused null dimensions, must match. A racing insert is re-read
and fully validated rather than trusted merely because its code already exists.

Any missing prerequisite or conflicting definition rolls back all new scopes and all
audit rows for that invocation. Existing definitions, credentials, profiles and capture
state are untouched. There is no repair, overwrite, origin reset or migration bypass.
Conflicting immutable definitions require separate administrator review.

A successful rerun creates no duplicate scopes. It adds VERIFIED audit events under
a fresh invocation UUID, recording that the existing definitions were deliberately
checked again. First inserts record CREATED. Database guards validate the active
capture creator, allowed static definitions, radiation mapping/owner/origin, canonical
metric/unit FK and exact scope snapshot. Audit updates/deletes/truncation are blocked.
V7/V24/V25/V31 constraints remain in force. Failed/rolled-back invocations leave no durable
success event and print only a fixed safe error. Database owners remain trusted;
direct privileged SQL is not authenticated by an application password check.

## Future approved operator workflow — not executed here

1. Verify the intended development database, obtain explicit migration/provisioning
   approval, take a recoverable backup and inspect pending migrations. Apply and validate
   the separately reviewed migrations through V32 using the approved migration workflow.
   Do not start Boot against that database merely to test or implicitly migrate it.
2. Verify existing active demo profiles and the intended officer account. Missing accounts
   or profiles require separate approved provisioning; this tool does not create them.
3. Register the actual Python workspace/run manifest and explicit source-to-crew mappings
   through the existing secured capture registration API. Record the returned capture UUID.
4. In a real interactive terminal, build the command without starting Boot:

   ```powershell
   # From backend/, with JAVA_HOME pointing to JDK 21; compilation targets Java 17.
   .\mvnw.cmd -B compile dependency:build-classpath '-DincludeScope=runtime' '-Dmdep.outputFile=target/scope-provisioning-classpath.txt'
   if ($LASTEXITCODE -ne 0) { throw 'Build failed; do not provision.' }
   $scopeClasspath = 'target/classes;' + (Get-Content target/scope-provisioning-classpath.txt -Raw).Trim()
   $env:ASTROHEALTH_ENV = 'development'
   $env:SIMULATION_CAPTURE_REGISTRATION_ENABLED = 'true'
   $env:SIMULATION_SCOPE_PROVISIONING_ENABLED = 'true'
   # Set DB_URL/DB_USER/DB_PASSWORD privately for the separately approved database.
   # Replace the placeholder with the actual registered capture UUID.
   try {
     & "$env:JAVA_HOME\bin\java.exe" -cp $scopeClasspath com.augustine.nasa_space_app_backend.provisioning.DemoSimulationScopeProvisioningCommand --provision-simulation-scopes '--capture=<registered-capture-UUID>'
     if ($LASTEXITCODE -ne 0) { throw 'Scope provisioning failed; inspect the fixed safe message.' }
   } finally {
     Remove-Item Env:SIMULATION_SCOPE_PROVISIONING_ENABLED -ErrorAction SilentlyContinue
   }
   ```

   The operator enters the capture creator's login and password interactively. Standard
   output reports created/verified counts, scope IDs/codes and an audit invocation UUID.
   Do not run via Maven exec or redirect/pipeline officer passwords.
5. Review the scope IDs and audit records. Do not treat technical scope provisioning
   as approval of thresholds, personal baselines, medical interpretation or alerts.

## Verification and remaining integration work

Tests invoke the helper only against per-test PostgreSQL 17 Testcontainers schemas.
They cover every definition, all four destinations, absent/archived prerequisites,
authentication/flags/loopback guards, migration validation, V31-to-V32 upgrade without
seeding, conflicting immutable definitions, independent radiation origins, database
cross-astronaut rejection, audit retention, concurrent retries and resolver/ingestion
compatibility for all nine indicator families. The interactive command is never executed.

```powershell
.\mvnw.cmd -B '-Dtest=DemoSimulationScopeCommandTests,SimulationScopeProvisioningTests,SimulationIngestionTests,SimulationIngestionConcurrencyTests,SimulationPersistenceTests' test
.\mvnw.cmd -B test
```

Before live delivery, complete the separately approved database migration and identity
prerequisites, register the actual capture, run/review this explicit scope operation,
then separately review Python delivery batching, authenticated session/CSRF ownership,
checkpoint/retry handling and workspace restart behavior. No Python delivery has been
connected. The development database, actual demo accounts, frontend, simulation code,
trained models, clinical thresholds and personal baselines were not changed here.
