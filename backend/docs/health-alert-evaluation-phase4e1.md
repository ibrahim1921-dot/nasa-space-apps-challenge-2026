# Backend health alert evaluation (Phase 4E.1)

## Flow and activation

Automatic evaluation is **disabled by default**. This phase changes no development
database, provisions no thresholds, and does not backfill or scan legacy observations.
The only current observation ingestion service is `SimulationIngestionService`.
When explicitly configured with `astrohealth.monitoring.evaluation-enabled=true`,
it calls `ObservationEvaluationOutbox.enqueueNewObservation` for newly inserted
observations, in the same transaction as the observation, values and receipt.
Duplicate receipts return the existing observation without enqueueing again.
The outbox hook requires an existing transaction; future real-observation ingestion
must call the same hook for new observations only. It is not a legacy-data API.

With this explicit opt-in, `HealthEvaluationWorker` polls every five seconds after
an initial five-second delay (configurable via `poll-delay-ms` and
`initial-delay-ms` under `astrohealth.monitoring`). It processes at most 100 jobs per
poll. `HealthObservationEvaluator.processNext` starts an independent transaction,
claims one committed job with `FOR UPDATE SKIP LOCKED`, evaluates every catalog
metric, writes outcomes/alerts/evidence, and marks completion atomically.

Monitoring failures roll back that evaluation transaction, never the successful
ingestion. The worker records a generic immutable `EVALUATION_FAILED` audit entry
for the exact failed observation and defers its job for one minute. Other jobs can
proceed on the next poll. Retries are retained indefinitely rather than discarding
unprocessed evidence. Queue/infrastructure failures are logged without medical
payloads and retried on subsequent polls. Outbox insertion is an ordinary durable
write in the ingestion transaction: database failure to persist either the receipt
or the outbox aborts that uncommitted ingestion rather than losing the queued work.

## Evaluation semantics

Canonical values come exclusively from persisted observation value tables. Scalar
values, systolic and diastolic values, sleep seconds converted to hours, mood score,
grip force, muscle mass and areal bone density cover all 11 metrics in nine families.
An absent optional muscle component produces `METRIC_UNAVAILABLE` independently
of the available component. There is no ML dependency or simulator-reference input.

The engine reuses the Phase 4D.2 selection code, with a package-private trusted
background path. Public rule/baseline selection still checks authenticated account
and astronaut ownership. The engine uses exact astronaut, indicator, metric, unit,
scope UUID, context and **measurement time**, with existing rule precedence,
activation history, half-open validity and approved personal baseline selection.
There are no context fallbacks, unit aliases or invented threshold values.

Inclusive bounds do not alert on equality. A value strictly outside either selected
bound creates one alert for that observation/metric, with the configured severity
(`INFO`, `WARNING` or `CRITICAL`), without magnitude-based escalation. Each metric
receives one immutable outcome, including non-alert results: `WITHIN_BOUNDS`,
`MISSING_RULE` (no active applicable rule, including inactive/expired rules),
`CONFLICT`, `MISSING_BASELINE`, `INVALID_BASELINE_BOUNDS`, `INVALID_RULE`,
`BASELINE_CONFLICT`, `METRIC_UNAVAILABLE`, `SUPERSEDED`, `DEMO_DISABLED`,
`SYNTHETIC_MISMATCH` or `INVALID_RADIATION`.

Completed jobs and outcomes are immutable. There is no automatic reevaluation
under later rule versions. Row locking and the unique `(observation_id,metric_code)`
key prevent duplicate alerts under concurrent consumers and retries. A failed
multi-metric transaction leaves neither partial alerts nor partial outcomes.

Out-of-order observations use their own timestamps, including historical rule
versions. Observations already superseded when processed receive `SUPERSEDED`;
replacement observations are evaluated independently. Previously created alerts,
evidence and evaluations remain unchanged when a later correction arrives. This
phase does not automatically resolve old alerts. Each outcome records the
predecessor link when present.

Cumulative absorbed radiation is compared as the persisted **total**, never summed
or converted to mSv. Matching scope identifies the astronaut, accumulation origin,
body site and dosimetry method. The engine rejects a total before its scope origin,
a decrease against any current earlier total, an increase incompatible with a
current later total, or different totals at the same timestamp. Out-of-order totals
consistent with their neighbours remain eligible for rule evaluation. Previously
completed outcomes are not rewritten when later evidence changes the series.

## Evidence, synthetic data and security

V35 adds the durable outbox, immutable metric outcomes/failure history, and a typed
`health_alerts.is_synthetic` flag. Existing alert lifecycle and evidence triggers
remain in force. `alert_observations` links the exact observation and astronaut.
The outcome has typed rule, approved baseline and alert references. Immutable alert
provenance/outcome details record engine version, exact rule/baseline versions,
effective bounds, observed value/unit, scope/context, source metadata, measurement
time and evaluation time. `triggered_at` is the observation time so historical rule
validity checks remain correct; `evaluated_at` records processing time separately.
Database-created alert/evidence events identify `SYSTEM:HEALTH_RULE_ENGINE` as actor.

Synthetic observations are identified from source kind, simulation metadata,
simulated check-ins and source provenance. They cannot use specialized real comparison scopes
or operational/clinical rules. The five canonical generic default scopes are
shared across sources: after the Phase 4C.6C integration fix, their synthetic
observations resolve only explicitly configured SYNTHETIC_DEMO rules using the
trusted persisted source discriminator. Real observations on the same scope
continue to resolve only real rules. There is no fallback between the channels.
Synthetic scopes with real-looking observations
also fail closed. Demo resolution additionally requires the independent explicit
`astrohealth.monitoring.demo-enabled=true` gate and a SYNTHETIC_DEMO rule.
Generated demo alerts retain rule severity but have `is_synthetic=true`, a
`NONCLINICAL SYNTHETIC DEMO` reason, `demonstration_only=true`, source simulation
metadata and `clinical_emergency=false`. Real alerts are configured rule violations,
not automatic medical diagnoses. Future delivery must preserve this distinction.

There are no new HTTP endpoints or security filter changes. User input cannot
choose rule IDs, values or baseline references for evaluation. Alert listing,
acknowledgment, resolution, dashboard delivery and ML integration are outside this
phase. Existing authentication, CSRF, CORS and history protections remain active.

## Validation

PostgreSQL 17 Testcontainers tests cover the full metric catalog, configured
severities, inclusive bounds, no-alert outcomes, approved baseline evidence, exact
contexts/scopes, temporal versions, corrections, radiation totals, duplicate
receipts, concurrent consumers, ingestion rollback, failure isolation/retry,
synthetic provenance, immutable outcomes and HTTP security boundaries. Committed
background-processing fixtures use a separate disposable schema to preserve
isolation from existing transactional tests.
