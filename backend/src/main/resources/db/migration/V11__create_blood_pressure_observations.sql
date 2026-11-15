-- One episodic paired pressure observation; no duplicate scalar records.

CREATE TABLE blood_pressure_observations (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL DEFAULT 'blood_pressure' CHECK (indicator_code = 'blood_pressure'),
    storage_kind TEXT NOT NULL DEFAULT 'BLOOD_PRESSURE' CHECK (storage_kind = 'BLOOD_PRESSURE'),
    systolic NUMERIC(8,3) NOT NULL CHECK (systolic > 0 AND systolic < 'Infinity'::numeric),
    diastolic NUMERIC(8,3) NOT NULL CHECK (diastolic > 0 AND diastolic < 'Infinity'::numeric),
    unit TEXT NOT NULL DEFAULT 'mmHg' CHECK (unit = 'mmHg'),
    method TEXT,
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT
);
