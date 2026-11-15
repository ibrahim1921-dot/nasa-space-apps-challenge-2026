-- Mission definitions. Participation history belongs to astronaut_missions.

CREATE TABLE missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_code TEXT NOT NULL UNIQUE CHECK (btrim(mission_code) <> ''),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at))
);
