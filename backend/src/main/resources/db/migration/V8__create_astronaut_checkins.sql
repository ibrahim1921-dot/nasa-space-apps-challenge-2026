-- Reported time is independent of ingestion time. Optional idempotency keys are
-- unique per astronaut. Services compare retry payloads and reuse the original
-- result. NULL symptoms means no report; reading-only check-ins are supported.

CREATE TABLE astronaut_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    astronaut_mission_id UUID,
    reported_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    symptoms TEXT CHECK (btrim(symptoms) <> ''),
    notes TEXT,
    idempotency_key TEXT CHECK (btrim(idempotency_key) <> ''),
    source_name TEXT NOT NULL CHECK (btrim(source_name) <> ''),
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    simulation_metadata JSONB CHECK (jsonb_typeof(simulation_metadata) = 'object'),
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
    FOREIGN KEY (astronaut_mission_id, astronaut_id) REFERENCES astronaut_missions(id, astronaut_id) ON DELETE RESTRICT,
    UNIQUE (astronaut_id, idempotency_key),
    UNIQUE (id, astronaut_id),
    CHECK (is_simulated = (simulation_metadata IS NOT NULL)),
    CHECK (isfinite(reported_at) AND isfinite(ingested_at))
);

CREATE INDEX astronaut_checkins_history_idx ON astronaut_checkins (astronaut_id, reported_at DESC);

CREATE INDEX astronaut_checkins_mission_idx ON astronaut_checkins (astronaut_mission_id);
