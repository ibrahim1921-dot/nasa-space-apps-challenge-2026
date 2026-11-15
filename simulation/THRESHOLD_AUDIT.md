# Repository threshold audit

This is a read-only audit of repository definitions, not a medical assessment or
independent verification of cited clinical sources. No database was queried. A
deployed database could contain operator-supplied records not present in source.
No number below is adopted as NASA clinical guidance by the simulator.

## Three different kinds of numbers

1. **Data validation**: SQL storage/type/finite-value constraints and explicit
   scope constraints. Passing them does not mean a person is healthy.
2. **Personal reference/deviation**: a reference for one astronaut, metric, unit,
   scope, context, kind, version, and effective period. A difference is not an alert.
   Engine reference values, noise SDs, scenario gains, rates, and model clipping
   are arbitrary synthetic model parameters, not measured personal baselines.
3. **Alert thresholds**: configured monitoring bounds, severity, validity, evidence,
   precedence, and rationale. This phase neither configures nor evaluates alerts.

## Backend evidence

Paths below are relative to `backend/src/main/resources/db/migration/`.

| Family | Catalog metrics / exact units (V22) | Validation evidence | Clinical alert thresholds in migrations |
| --- | --- | --- | --- |
| Heart rate | `heart_rate.value`, `beats/min` | V10 finite NUMERIC(18,6); no HR-specific range | None |
| Blood pressure | `blood_pressure.systolic`, `.diastolic`, `mmHg` | V11 each positive finite NUMERIC(8,3); SQL does **not** enforce systolic > diastolic | None |
| Blood glucose | `blood_sugar.value`, `mmol/L` | V10 finite NUMERIC(18,6); no glucose-specific range or fasting definition | None |
| Temperature | `body_temperature.value`, `Cel` | V10 finite NUMERIC(18,6); no temperature-specific range | None |
| Sleep | `sleep_hours.duration`, `h` | V12 completed session, end > start, integer asleep_seconds >= 0 and <= elapsed seconds; V25 measured_at = ended_at. Hours are derived, not stored twice | None |
| Mood | `mood.score`, `score` | V13 finite score; V7 scope defines scale identity/version/min/max; V25 checks score against that scope | No seeded scale or alert bound |
| Muscle | `muscle.grip_strength`, `kgf`; `.muscle_mass`, `kg` | V14 grip >= 0, mass > 0, finite NUMERIC(12,4), at least one component. V7 requires site + protocol/version | No seeded site/protocol or alert bound |
| Bone | `bone_mineral_density.areal_density`, `g/cm2` | V15 positive finite NUMERIC(12,6); V7 requires site + protocol/version | No seeded site/protocol or alert bound |
| Radiation | `cumulative_absorbed_radiation_dose.value`, `mGy` | V10 nonnegative finite value; V7 requires target/site, astronaut, origin time, method; V25 owner/origin checks. SQL does **not** enforce monotonicity | No seeded personal origin, dose rate, or limit |

V4-V6 define storage kinds, metric/unit relationships and the five contexts:
`RESTING`, `SLEEPING`, `EXERCISING`, `OTHER`, `UNKNOWN`. Recovery is not an enum
value. UNKNOWN is explicitly not a wildcard. V22 permits all five contexts for
all indicators; that permission does not establish a clinical interpretation.

V22 seeds only catalogs and `default` scopes for heart rate, blood pressure,
glucose, temperature and sleep. It explicitly seeds no astronauts, observations,
personal baselines or medical limits. Review of V1-V30 finds no INSERT into
`personal_baselines` or `monitoring_rules`.

V16 defines ORIGINAL and ROLLING baseline series, optional lower/upper bounds,
effective/input periods, sample count, method, source, provenance and version
links. It supplies no reference values, baseline bands, minimum estimation sample
count policy, rolling window policy, deviation cutoffs, or estimation algorithm.
The SQL sample_count > 0 constraint alone is not statistical sufficiency.

V17 defines inclusive configured lower/upper bounds (at least one required),
INFO/WARNING/CRITICAL severity and validity intervals. No numeric rules are
seeded. Rule precedence and validity-period selection are service responsibilities.
V26 preserves published baseline/rule contents and linked versions; it does not
fill in missing values or enforce overlap policy. V27 checks alert ownership,
scope/context/rule validity and evidence, but actual breaches are service logic.
V21/V29 store/protect model executions without supplying the trained model's
decision policy. This simulator creates none of these records.

## Existing frontend and ML numbers are not backend rules

Repository evidence only, without endorsing its cited clinical attributions:

- `frontend/src/content/limits.js` contains resting-HR watch >100 bpm, team alert
  >120, team lows <50/<40; BP watch >=130/80 and alert >=140/90, crisis >180/120,
  plus team low bounds; fasting glucose >=100/>=126 and lows <70/<54 **mg/dL**;
  temperature >=37.5/>=38 and lows <36/<35 degrees Celsius; sleep watch <=6,
  team alert <4.5 and guidance >=7 h; a team mood watch <=1 on a 1-5 scale.
  Source metadata and `team_set` flags must not be discarded. These values are
  not automatically applicable to exercising, recovery, or simulated subjects.
- `frontend/src/lib/vitalsCheckin.js` separately contains input plausibility
  bounds: BP 60-260 / 30-160 mmHg, HR 25-220 bpm, glucose 20-600 mg/dL,
  temperature 30-43 degrees Celsius, sleep 0-24 h and integer mood 1-5.
  Those are UI input constraints, not backend clinical rules or SQL ranges.
- `frontend/src/lib/baseline.js` has a 14-day window, 7-day minimum, watch Z=2,
  alert Z=3.5, EWMA alpha=.3, drift Z=1 for 5 days and a two-watch-indicator
  aggregation choice. These are frontend algorithm settings, not V16/V17 records.
- `ml/src/crewhealth_ml/fitness.py` and `ml/outputs/fitness_norms.json` carry
  suggested 20% alert / 10% watch drops and explicitly mark the 10% choice as
  team-set. The referenced muscle-mass loss statistic is not proof of a validated
  per-person grip-force alert cutoff. The ML artifact labels grip as `kg`, whereas
  V22 distinguishes grip force `kgf` from muscle mass `kg`. No automatic mapping
  or use of that trained model occurs here.
- No reviewed source establishes backend monitoring rules for muscle mass, bone
  site/protocol changes, or personal cumulative absorbed dose. Station radiation,
  absorbed mGy and equivalent/effective mSv are not interchangeable.

## Unresolved before real ingestion/evaluation

- Approve per-astronaut reference values, sampling evidence and baseline versions,
  activity/scope matching, windowing and effective periods. Do not turn synthetic
  parameters into measured baseline rows by inventing sample counts.
- Define mood scale, muscle sites/protocols, bone examination site/protocol and
  personal absorbed-dose origin/method; register or resolve stable scope UUIDs.
- Review and approve numeric monitoring rules and sources per unit, metric,
  context and population; settle precedence, overlap, evidence, persistence,
  change-from-baseline logic, aggregation and escalation. None is implemented.
- Resolve frontend glucose/display-unit aliases and the ML grip quantity label
  explicitly. Never copy a numeric mg/dL bound into a mmol/L rule.
- Establish radiation-origin handling and monotonicity checks in future ingestion.
  The engine guarantees monotonic dose only within each synthetic run's origin.
- Review the proposed JSON contract and authenticated ingestion/idempotency policy.
  No ingestion endpoint, alert engine, PostgreSQL seed, or trained-model work is
  included in Phase 4A.
