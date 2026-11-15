-- Scalar values only; structured observations own their values exclusively.
-- Accumulation origin/target for absorbed radiation dose live in the scope.
-- mGy is not interchangeable with equivalent/effective dose in mSv.

CREATE TABLE health_measurements (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL,
    storage_kind TEXT NOT NULL DEFAULT 'SCALAR' CHECK (storage_kind = 'SCALAR'),
    metric_code TEXT NOT NULL DEFAULT 'value' CHECK (metric_code = 'value'),
    value NUMERIC(18,6) NOT NULL CHECK (value > '-Infinity'::numeric AND value < 'Infinity'::numeric),
    unit TEXT NOT NULL,
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, metric_code, unit) REFERENCES indicator_metrics(indicator_code, metric_code, unit) ON DELETE RESTRICT,
    CHECK (indicator_code <> 'cumulative_absorbed_radiation_dose' OR value >= 0)
);
