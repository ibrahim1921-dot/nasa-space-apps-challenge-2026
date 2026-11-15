-- Explicit canonical units and metric components (for example systolic/diastolic).
-- Measurement unit conversion is an ingestion responsibility.

CREATE TABLE indicator_metrics (
    indicator_code TEXT NOT NULL REFERENCES health_indicators(code) ON DELETE RESTRICT,
    metric_code TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (btrim(unit) <> ''),
    PRIMARY KEY (indicator_code, metric_code),
    UNIQUE (indicator_code, metric_code, unit)
);
