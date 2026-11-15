-- Repeated participation periods are allowed. Services validate mission-date
-- containment and any overlap policy; historical FKs never cascade-delete.

CREATE TABLE astronaut_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE RESTRICT,
    role TEXT,
    joined_at TIMESTAMPTZ NOT NULL,
    departed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (astronaut_id, mission_id, joined_at),
    UNIQUE (id, astronaut_id),
    CHECK (departed_at IS NULL OR departed_at > joined_at)
);

CREATE INDEX astronaut_missions_mission_idx ON astronaut_missions (mission_id, joined_at);
