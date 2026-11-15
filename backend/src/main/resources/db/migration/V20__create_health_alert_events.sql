-- Append-only audit snapshots. The sequence orders events even when transaction
-- timestamps match; sequence gaps are normal and it is not global commit order.
-- V28 writes lifecycle/evidence events; V24 protects historical rows.

CREATE TABLE health_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    alert_id UUID NOT NULL REFERENCES health_alerts(id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor TEXT NOT NULL CHECK (btrim(actor) <> ''),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('CREATED', 'ACKNOWLEDGED', 'RESOLVED', 'EVIDENCE_ADDED')),
    details JSONB NOT NULL CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX health_alert_events_history_idx ON health_alert_events (alert_id, event_sequence);
