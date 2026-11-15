-- Versioned model executions with separate cutoff/request/start/completion times.
-- Result JSON intentionally leaves the teammate's output schema open. Services
-- validate result_schema_version and record input sources/simulation in provenance.
-- Related rule alerts precede triggered assessments; successful assessments may
-- then produce ML alerts. V29 protects execution inputs and completed results.

CREATE TABLE ml_health_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    astronaut_mission_id UUID,
    assessment_trigger TEXT NOT NULL CHECK (assessment_trigger IN ('SCHEDULED', 'RULE_ALERT', 'SELF_REPORT')),
    related_alert_id UUID,
    checkin_id UUID,
    model_identifier TEXT NOT NULL CHECK (btrim(model_identifier) <> ''),
    model_version TEXT NOT NULL CHECK (btrim(model_version) <> ''),
    input_data_cutoff_at TIMESTAMPTZ NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    result_schema_version TEXT CHECK (btrim(result_schema_version) <> ''),
    result JSONB CHECK (jsonb_typeof(result) = 'object'),
    error_message TEXT CHECK (btrim(error_message) <> ''),
    input_provenance JSONB NOT NULL CHECK (jsonb_typeof(input_provenance) = 'object'),
    FOREIGN KEY (astronaut_mission_id, astronaut_id) REFERENCES astronaut_missions(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (related_alert_id, astronaut_id) REFERENCES health_alerts(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (checkin_id, astronaut_id) REFERENCES astronaut_checkins(id, astronaut_id) ON DELETE RESTRICT,
    UNIQUE (id, astronaut_id),
    CHECK (assessment_trigger <> 'RULE_ALERT' OR related_alert_id IS NOT NULL),
    CHECK (assessment_trigger <> 'SELF_REPORT' OR checkin_id IS NOT NULL),
    CHECK (input_data_cutoff_at <= requested_at),
    CHECK (started_at IS NULL OR started_at >= requested_at),
    CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
    CHECK ((status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL)
        OR (status = 'RUNNING' AND started_at IS NOT NULL AND completed_at IS NULL)
        OR (status IN ('SUCCEEDED', 'FAILED') AND completed_at IS NOT NULL)),
    CHECK ((status = 'SUCCEEDED' AND result IS NOT NULL AND result_schema_version IS NOT NULL AND error_message IS NULL)
        OR (status = 'FAILED' AND error_message IS NOT NULL AND result IS NULL)
        OR (status IN ('PENDING', 'RUNNING') AND result IS NULL AND error_message IS NULL)),
    CHECK (isfinite(input_data_cutoff_at) AND isfinite(requested_at)
        AND (started_at IS NULL OR isfinite(started_at))
        AND (completed_at IS NULL OR isfinite(completed_at)))
);

CREATE INDEX ml_health_assessments_history_idx ON ml_health_assessments (astronaut_id, requested_at DESC);

CREATE INDEX ml_health_assessments_mission_idx ON ml_health_assessments (astronaut_mission_id);

CREATE INDEX ml_health_assessments_alert_idx ON ml_health_assessments (related_alert_id);

CREATE INDEX ml_health_assessments_checkin_idx ON ml_health_assessments (checkin_id);
