-- Rule/manual/self-report/ML alerts. V27 enforces OPEN -> ACKNOWLEDGED ->
-- RESOLVED with immutable identity/trigger data; V28 audits successful changes.
-- ml_assessment_id is declared here; its circular FK is added in V23.

CREATE TABLE health_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    astronaut_mission_id UUID,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('RULE', 'SELF_REPORT', 'ML', 'MANUAL')),
    ml_assessment_id UUID,
    monitoring_rule_id UUID REFERENCES monitoring_rules(id) ON DELETE RESTRICT,
    checkin_id UUID,
    source_name TEXT NOT NULL CHECK (btrim(source_name) <> ''),
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    triggered_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT CHECK (btrim(acknowledged_by) <> ''),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT CHECK (btrim(resolved_by) <> ''),
    resolution_note TEXT,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
    FOREIGN KEY (astronaut_mission_id, astronaut_id) REFERENCES astronaut_missions(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (checkin_id, astronaut_id) REFERENCES astronaut_checkins(id, astronaut_id) ON DELETE RESTRICT,
    UNIQUE (id, astronaut_id),
    CHECK ((trigger_kind = 'RULE') = (monitoring_rule_id IS NOT NULL)),
    CHECK (trigger_kind <> 'SELF_REPORT' OR checkin_id IS NOT NULL),
    CHECK ((acknowledged_at IS NULL) = (acknowledged_by IS NULL)),
    CHECK ((resolved_at IS NULL) = (resolved_by IS NULL)),
    CHECK (acknowledged_at IS NULL OR acknowledged_at >= triggered_at),
    CHECK (resolved_at IS NULL OR resolved_at >= triggered_at),
    CHECK (resolved_at IS NULL OR acknowledged_at IS NULL OR resolved_at >= acknowledged_at),
    CHECK ((status = 'OPEN' AND acknowledged_at IS NULL AND resolved_at IS NULL)
        OR (status = 'ACKNOWLEDGED' AND acknowledged_at IS NOT NULL AND resolved_at IS NULL)
        OR (status = 'RESOLVED' AND resolved_at IS NOT NULL AND btrim(resolution_note) <> '' AND resolution_note IS NOT NULL)),
    CHECK (isfinite(triggered_at) AND isfinite(created_at)
        AND (acknowledged_at IS NULL OR isfinite(acknowledged_at))
        AND (resolved_at IS NULL OR isfinite(resolved_at))),
    CONSTRAINT health_alerts_ml_source_check CHECK ((trigger_kind = 'ML') = (ml_assessment_id IS NOT NULL)),
    CONSTRAINT health_alerts_resolution_note_state CHECK (status = 'RESOLVED' OR resolution_note IS NULL)
);

CREATE INDEX health_alerts_history_idx ON health_alerts (astronaut_id, triggered_at DESC);

CREATE INDEX health_alerts_active_idx ON health_alerts (astronaut_id, severity, triggered_at DESC) WHERE status <> 'RESOLVED';

CREATE INDEX health_alerts_mission_idx ON health_alerts (astronaut_mission_id);

CREATE INDEX health_alerts_rule_idx ON health_alerts (monitoring_rule_id);

CREATE INDEX health_alerts_checkin_idx ON health_alerts (checkin_id);

CREATE INDEX health_alerts_ml_assessment_idx ON health_alerts (ml_assessment_id);
