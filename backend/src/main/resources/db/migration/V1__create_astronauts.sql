-- PostgreSQL 17: UUID v4 defaults use built-in gen_random_uuid(); no extension.
-- Stable crew codes are distinct from UUIDs. Identity protection is installed in V24.

CREATE TABLE astronauts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crew_code TEXT NOT NULL UNIQUE CHECK (btrim(crew_code) <> ''),
    display_name TEXT NOT NULL CHECK (btrim(display_name) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMPTZ
);
