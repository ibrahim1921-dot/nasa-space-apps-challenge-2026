-- Catalog metadata only: nine indicators, metric units, activity contexts, and
-- generic scopes for metrics without site/scale/origin dimensions. No astronauts,
-- observations, simulated data, personal baselines or medical limits are seeded.
-- Radiation is personal cumulative ABSORBED dose (mGy), not station environment
-- data or equivalent/effective dose (mSv). Those need distinct future quantities.
-- kgf is grip force, kg is muscle mass. All five activity contexts are currently
-- allowed; narrowing that policy requires explicit team agreement.

INSERT INTO health_indicators (code, name, storage_kind, sampling_description) VALUES
    ('heart_rate', 'Heart rate', 'SCALAR', 'Device or spot reading'),
    ('blood_pressure', 'Blood pressure', 'BLOOD_PRESSURE', 'Paired episodic observation'),
    ('blood_sugar', 'Blood glucose', 'SCALAR', 'Device or episodic laboratory reading'),
    ('body_temperature', 'Body temperature', 'SCALAR', 'Device or spot reading'),
    ('sleep_hours', 'Sleep duration', 'SLEEP', 'Completed sleep session'),
    ('mood', 'Mood', 'MOOD', 'Self-report on an identified scale'),
    ('muscle', 'Muscle strength and mass', 'MUSCLE', 'Periodic protocol-specific assessment'),
    ('bone_mineral_density', 'Bone mineral density', 'BONE', 'Periodic site-specific examination'),
    ('cumulative_absorbed_radiation_dose', 'Personal cumulative absorbed radiation dose', 'SCALAR',
     'Personal absorbed dose accumulated since an explicit origin; not station environment data');

INSERT INTO indicator_metrics (indicator_code, metric_code, unit) VALUES
    ('heart_rate', 'value', 'beats/min'),
    ('blood_pressure', 'systolic', 'mmHg'), ('blood_pressure', 'diastolic', 'mmHg'),
    ('blood_sugar', 'value', 'mmol/L'), ('body_temperature', 'value', 'Cel'),
    ('sleep_hours', 'duration', 'h'), ('mood', 'score', 'score'),
    ('muscle', 'grip_strength', 'kgf'), ('muscle', 'muscle_mass', 'kg'),
    ('bone_mineral_density', 'areal_density', 'g/cm2'),
    ('cumulative_absorbed_radiation_dose', 'value', 'mGy');

INSERT INTO indicator_contexts (indicator_code, activity_context)
SELECT code, context FROM health_indicators
CROSS JOIN (VALUES ('RESTING'), ('SLEEPING'), ('EXERCISING'), ('OTHER'), ('UNKNOWN')) AS c(context);

INSERT INTO measurement_comparison_scopes (scope_code, indicator_code, storage_kind)
SELECT 'default', code, storage_kind FROM health_indicators
WHERE code IN ('heart_rate', 'blood_pressure', 'blood_sugar', 'body_temperature', 'sleep_hours');
