# AstroHealth synthetic simulation engine — Phase 4A

**Synthetic testing/demo data only. Not the trained ML model, a validated
physiology model, NASA clinical guidance, or an alert engine.** This directory is
independent of `frontend/`, `backend/`, and `ml/`. It imports no teammate code,
loads no model or database, and changes no migrations. The independent React lab
now lives in `ui/` and calls only the local Python HTTP adapter in `api/`.
See [React lab launch instructions](ui/README.md) and [API documentation](api/README.md).

Phase 4C.1 adds `GET /api/v1/observations` to the local API: complete original
synthetic envelopes, bounded snapshot pagination, and restart-aware checkpoints.
See [the export contract](api/README.md#complete-observation-export-phase-4c1)
and [a complete response example](examples/export-page.json). This is in-memory
export, not durable storage or Spring Boot ingestion. Numeric synthetic mood
scores are demonstration data, not astronaut-submitted clinical assessments.

## Setup and CLI

Python **3.11+**, standard library only. No pip install, ML environment, credentials,
Docker, database, or backend startup is needed. Run from the repository root:

```powershell
python -m simulation.engine --days 1 --seed 42
python -m simulation.engine --scenario exercise --days 0.125 --seed 42
python -m simulation.engine --scenario stress_sleep_deprivation --stress 0.8 --sleep-hours 5 --days 2
python -m simulation.engine --scenario elevated_radiation --radiation-multiplier 3 --days 2
python -m simulation.engine --config simulation/examples/demo-config.json --days 28 > simulation-demo.ndjson
```

The last command is illustrative: choose an output location that you do not
commit as real medical data. A full day has fast vital observations; a full
28-day virtual run reaches the first bone examination and four muscle sessions.
There is **no real-time wait**. To exercise the acceleration API explicitly:

```powershell
python -m simulation.engine --wall-seconds 28 --time-scale 86400 --seed 42
```

This advances 28 *supplied* seconds into 28 virtual days. It is not a timed
background process. Output is JSON Lines: one run manifest, followed by synthetic
observation envelopes. `--days` and `--wall-seconds` are mutually exclusive.
`--help` lists controls. Defaults: seed 42, UTC start 2026-01-01 08:00, 15-minute
internal tick, scenario `normal`. Durations must end on that tick grid; CLI days
are limited to 0-365 and each API advance to 100,000 ticks.

On the inspected Windows workstation, the `python` app alias was unavailable;
the working interpreter was:

```powershell
& "$env:LOCALAPPDATA/Programs/Python/Python314/python.exe" -m simulation.engine --days 1
```

## Structure

```text
simulation/
  __init__.py
  README.md
  THRESHOLD_AUDIT.md
  engine/
    __init__.py
    __main__.py
    catalog.py       # Schema vocabulary, units, cadence defaults, scope descriptors
    config.py        # Personal/context parameters and validated scenario controls
    simulator.py     # RNG streams, latent state, scheduling, lifecycle, JSON envelopes
    cli.py
  api/
    __init__.py
    __main__.py
    lab.py           # Thread-safe lifecycle adapter and chart projections
    server.py        # Loopback-only HTTP service and simulation clock driver
    README.md
  examples/
    demo-config.json
    sample.json      # Ten scoped observations spanning all nine families
  tests/
    test_simulator.py
    test_api.py
  ui/
    src/             # Independent React lab; no probability model in JavaScript
    tests/           # Presentation tests and real local browser integration
    package.json
    package-lock.json
    README.md
```

## Generation and cadence

These are transparent **demo equations and choices**, not trained/validated
physiology or recommended sampling schedules. Each astronaut has an independent
stable SHA-256-derived random stream. Autoregressive residuals are updated every
tick, including ticks with no measurement. Shared arousal/fatigue create
correlated effects, rather than drawing unrelated values for every reading.
Changing an emission cadence does not consume different random draws or alter
another family's generated path.

| Family / catalog code | Generation | Default virtual cadence |
| --- | --- | --- |
| `heart_rate` | Personal/context reference + correlated arousal/fatigue, circadian term and persistent residual | 15 min |
| `blood_pressure` | Paired systolic/diastolic references, shared effects and persistent component residuals; demo pairing enforces systolic > diastolic | 1 h |
| `blood_sugar` | Personal/context reference, synthetic meal pulses, fatigue and residual; **mmol/L**, not mg/dL; not necessarily fasting | 6 h |
| `body_temperature` | Personal/context reference, circadian term, arousal and persistent residual; **Cel** | 1 h |
| `sleep_hours` | Completed daily window, personal duration + configured sleep/deprivation/fatigue + residual; integer asleep_seconds within elapsed time; hours derived | 24 h |
| `mood` | Personal score + shared stress/fatigue effects and residual, clipped to the explicitly synthetic 1-5 scale | 12 h |
| `muscle` | Grip **kgf** and muscle mass **kg** with slow exponential drift, activity protection and long-memory residuals; separate site/protocol observations | 7 days |
| `bone_mineral_density` | Personal areal density **g/cm2**, slow drift and long-memory residual; no acute exercise multiplier | 28 days |
| `cumulative_absorbed_radiation_dose` | Integrates nonnegative stochastic personal absorbed-dose rate every tick; emits cumulative **mGy**, never mSv or station exposure | 1 h |

All indicators share one virtual clock. Accelerating time advances the whole
system coherently; it does not pretend a monthly bone change happened in fifteen
medical minutes. Faster measurements remain at their own virtual cadences.
Cadences may be overridden in JSON, in minutes, as positive multiples of the
internal tick. Completed sleep remains daily. Cadences/model rates/noise floors
and positivity clipping are simulation settings, not alert thresholds.

## Personal baselines and contexts

`examples/demo-config.json` lists all eleven component references and noise SDs
for one fictional astronaut. Add entries to `profiles` for more astronauts, with
their own UUIDs, crew codes and `original` values. Omitted reference keys use
clearly synthetic demo defaults. No astronaut UUID is inferred from the real
backend; default UUIDs are deterministic fictional values. Replace/map them only
through a future authorized integration, not by claiming existing identities.

The catalog contexts are exactly `RESTING`, `SLEEPING`, `EXERCISING`, `OTHER`, and
`UNKNOWN`. The default context parameters are derived from each person's original
references with explicit demo offsets. For example, original heart rate is 64
beats/min and its exercise reference is 124. JSON `contexts` can override exercise,
sleeping, OTHER, or explicit UNKNOWN references per metric. A missing context is
an error; UNKNOWN is never used as a wildcard. The original context (RESTING,
or SLEEPING for duration) must remain consistent with `original` parameters.

Every observation carries original and actual-context parameter snapshots, exact
metric/unit/scope, and raw deviations in those units. They are labeled ORIGINAL
version 1 to identify the intended reference series; they are **not ready-made
`personal_baselines` rows**. No sample_count, real estimation window, actual
baseline UUID, clinical bound, or rolling estimate is invented. `noise_sd` is a
simulation noise setting, not an estimated physiological SD or decision cutoff.
ROLLING baseline estimation is not implemented.

`normal` uses a deterministic UTC daily schedule: sleep opportunity 00:00-08:00,
exercise 17:00-18:00, recovery 18:00-19:00, otherwise rest. Sleep duration can be
less than the opportunity because of synthetic wake/deprivation effects.
`exercise` starts with exercise then recovery; `recovery` starts with elevated
arousal and decay; `stress_sleep_deprivation` adds fatigue/stress and reduces
sleep; `elevated_radiation` multiplies the configured dose rate by five. These
scenario multipliers are arbitrary demonstration controls.

Recovery is `simulation_metadata.phase = "RECOVERY"` with schema context `OTHER`,
never an invented `RECOVERY` database enum. Completed sleep uses context
SLEEPING even when its end coincides with waking. Stress/activity are bounded
unitless controls in [0,1]; .7 defines the demo exercise-reference intensity.
Configured sleep is in [0,24] hours. Radiation rate/multiplier are nonnegative;
setting the multiplier to zero freezes dose rather than subtracting it.

## Lifecycle and deterministic replay

```python
from simulation.engine import Simulator, SimulationConfig

engine = Simulator(SimulationConfig(seed=42))
engine.start()                       # READY -> RUNNING
observations = engine.advance(1)     # One supplied second -> one virtual day by default
engine.pause()                       # No clock, RNG, or accumulation progress while paused
assert engine.advance(100) == []
engine.resume()
engine.set_scenario("exercise", activity=0.8, stress=0.2)
more = engine.step(4)                # Four internal ticks = one virtual hour
retained = engine.history            # Copy of the append-only, in-memory archive
engine.reset(seed=42)                # READY, new run/origin at the CURRENT virtual time
engine.start()
```

`reset` never deletes prior observations or touches any medical/database history.
It resets latent/RNG state and cumulative dose **only under a new run and new
accumulation origin**, preserving virtual-time continuity and generating distinct
source IDs. The origin includes the astronaut, start time, run-specific scope,
target site and dosimetry method. Dose within one origin is nondecreasing.
History/configuration views are copies, preventing accidental caller mutation.
This is in-memory state, not durable storage across process exits.

For exact replay use a fresh engine with the same seed, configuration, Python
version and control/lifecycle calls at the same ticks. CLI constant-config runs
are byte-for-byte repeatable. Live control changes require retaining their call
schedule as well as the seed; the future UI must record that schedule. Python's
Gaussian sampling is not promised bit-identical across Python implementations or
versions. Fixed internal ticks make partitioning supplied time equivalent, and
paused time is discarded rather than caught up on resume.

## JSON contract and sample

[examples/sample.json](examples/sample.json) contains actual deterministic seed-42
output: first observation from each family/scope during a 28-day normal run.
They have **different measurement times**, not one simultaneous clinical check-in.
Two muscle scopes make ten observations for nine families.

| First sample | Value | Context |
| --- | --- | --- |
| Heart rate | 62.944463 beats/min | RESTING |
| BP | 115.027 / 74.770 mmHg | RESTING |
| Glucose | 5.124988 mmol/L | RESTING |
| Temperature | 36.733176 Cel | RESTING |
| Sleep | 28,489 asleep seconds in a 9-hour completed window | SLEEPING |
| Mood | 4.3853 score on the synthetic scale | RESTING |
| Muscle | 36.0396 kgf grip; 27.9783 kg mass, separate scopes | RESTING |
| Bone | 1.076345 g/cm2 at virtual day 28 | RESTING |
| Cumulative dose | 0.009981 mGy after the first virtual hour | RESTING |

Each `astrohealth.simulation.observation.v1` envelope includes:

- `source: synthetic`, `is_simulated: true`.
- `observation`: V9 column names, `source_kind: SIMULATION`, source-record UUID,
  provenance and simulation_metadata containing seed, run, scenario and controls.
- `comparison_scope`: V7-compatible descriptor, including scale/site/protocol or
  personal dose-origin dimensions as required.
- `value_table` and `values`: the V10-V15 subtype column names and canonical
  units. The future backend supplies observation_id for that child row.
- `metrics`: canonical metric/unit view of the same values; **not additional
  scalar inserts** for compound families. Sleep duration is derived from seconds.
- `baseline_parameters` and `baseline_deviations`: synthetic reference metadata,
  with lower/upper bounds null and no status, severity, diagnosis, or alert.

This is a **proposed ingestion envelope**, not an implemented Spring API and not
directly insertable SQL. `comparison_scope_id` is intentionally null: V22 only
seeds five generic scopes, and this process cannot know their UUIDs. A future
authenticated ingestion adapter must resolve astronaut and scope UUIDs, approve
and register missing synthetic scope definitions, assign child/header IDs,
stamp server ingestion time, enforce transaction completeness/units/ownership,
and use source_record_id for idempotency. It must not generate an alert or ML
assessment just because a row is simulated. No HTTP sender is included.

## Threshold audit and tests

Read [THRESHOLD_AUDIT.md](THRESHOLD_AUDIT.md) for evidence paths and unresolved
policies. V16/V17 define reference/rule structures but seed no personal reference
values or monitoring thresholds. Frontend ranges and ML suggestions are separate,
with unit/scope mismatches and team-set choices; none is silently imported here.
The synthetic mood scale and model clamps are not clinical decision thresholds.

```powershell
python -m unittest discover -s simulation/tests -v
```

Tests cover all nine families/eleven metrics, exact units and subtype/scope
shapes, completed sleep consistency, context matching, parameter validation,
temporal correlation, correlated scenario effects, per-astronaut independence,
seed replay, time partitioning, lifecycle/history retention, cadence independence,
accelerated monthly output and cumulative radiation. They need no pytest install
and do not run or modify the ML/backend/frontend test suites.

Phase 4A's independent engine is preserved. The next local-lab phase adds UI/API
controls without PostgreSQL ingestion; review that interface before any Spring
Boot integration. Runtime scenario changes start Exercise/Recovery at the current
tick and can update validated time_scale without resetting the run. All original
seeded engine tests and checked-in Phase 4A sample remain valid.
