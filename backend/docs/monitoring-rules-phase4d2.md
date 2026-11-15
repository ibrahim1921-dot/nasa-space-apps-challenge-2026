# Monitoring rules (Phase 4D.2)

No medical limits, baseline values, alerts or evaluations are seeded or generated.

## Management

Enabled NASA officers can POST `/api/monitoring-rules` with the fields in
`MonitoringRuleRequest`. The authenticated officer supplies the approval note,
source name and traceable source reference. The server records approver identity
and approval time; these are not caller-controlled provenance fields. Designation
is `CLINICAL_REFERENCE`, `OPERATIONAL`, or `SYNTHETIC_DEMO`; a designation records
the officer's classification, not an independent medical certification.

Rules start inactive. POST `/api/monitoring-rules/{id}/activation` with `active`,
`effectiveAt` and `note` to schedule activation or deactivation. Effective times
must be prospective and strictly advance for that rule. Events cannot be edited,
deleted or truncated. GET `/api/monitoring-rules` returns immutable versions,
provenance and activation history to officers. All writes require session CSRF.

Reuse `ruleCode` to append a version. Versions advance by one, keep the same
astronaut/indicator/metric/unit/context/scope dimensions and advance `validFrom`.
Advisory locks serialize series creation; database triggers independently enforce
series invariants. Existing version contents remain protected by V26. No existing
rule is implicitly activated, including legacy rows without approval provenance.

## Read-only selection contract

`MonitoringRuleResolver.resolve` and GET
`/api/crew/{astronautId}/monitoring-rules/selection` accept indicator, metric, unit,
context, scope and observation time. Reads enforce current astronaut ownership or
officer authorization. There are no unit conversions or scope aliases. All nine
catalog families are supported; systolic/diastolic and grip strength/muscle mass
remain independent metric dimensions. A future engine should resolve both metrics
of a paired pressure observation independently.

RESTING, SLEEPING, EXERCISING, UNKNOWN and catalog-supported OTHER match exactly.
UNKNOWN is never a wildcard or an alias for RESTING. Validity periods are half-open
`[validFrom, validTo)`. The latest activation event effective at the observation
time determines activation. Once a newer version has become valid and has an
activation event effective at that time, it supersedes older versions permanently
for subsequent times, including after its deactivation or expiry. An unactivated
draft does not supersede a published version.

Among matching active versions, astronaut-specific rules precede general rules.
Two different rule codes at the same winning specificity produce `CONFLICT`;
severity, creation order and restrictive bounds do not break ties. Severity is an
explicit officer classification (`INFO`, `WARNING`, `CRITICAL`). There is no
automatic severity escalation. A general rule can apply when no active specific
rule applies. Missing matches return `MISSING_RULE`, without default numbers.

`ABSOLUTE` bounds use the registered unit. `BASELINE_DELTA` bounds are signed
offsets in that same unit: lower offsets must be nonpositive and upper offsets
nonnegative. They require a specific astronaut and a matching, independently
approved real personal baseline selected by the existing baseline service
(ROLLING before ORIGINAL). Missing approval/baseline returns `MISSING_BASELINE`;
baseline conflicts fail with the existing 409 response. Bounds returned by the
resolver are the baseline reference plus offsets, and include the baseline ID.
No simulator references are consulted. Bounds are inclusive; either side may be
absent. Decimal precision, storage domains, scale bounds, units and dimensions
are validated without imposing invented clinical ranges.
If adding offsets to the selected baseline violates a metric's storage domain or
mood scale, selection returns `INVALID_BASELINE_BOUNDS` with the rule and baseline
IDs and no usable bounds.

Synthetic scopes (including provisioning-audit scopes) require SYNTHETIC_DEMO.
Demo rules require explicit `astrohealth.monitoring.demo-enabled=true` (default
false), contain `nonclinical=true` provenance, and select only in the synthetic
source channel (including the shared-default exception below). With demo disabled
synthetic selection returns `DEMO_DISABLED`. Baseline
deviations are unavailable for synthetic scopes. Specialized real scopes reject demo rules.

Live integration addendum (Phase 4C.6C): the five canonical generic `default`
scopes (heart rate, blood pressure, glucose, temperature and sleep) describe shared
measurement dimensions and do not encode source origin. With the explicit demo
gate, officers may configure labeled SYNTHETIC_DEMO rules on these scopes. The
background resolver uses persisted observation provenance to select either the
synthetic-demo or real rule channel, never falling back between them. Real
observations cannot select demo rules, and synthetic observations cannot select
clinical/operational rules. Version supersession also stays within that channel.
Public dimension-only selection retains real-source behavior on shared default
scopes; callers cannot supply the trusted synthetic discriminator through HTTP.
No baseline-relative demo rules or simulated personal baselines are permitted.

The resolver does not evaluate observations or generate health alerts. Phase 4E.1
must consume selection status explicitly and preserve rule and baseline IDs in
any eventual evaluation record.
