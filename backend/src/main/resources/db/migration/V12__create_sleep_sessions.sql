-- Completed sleep session. asleep_seconds excludes waking periods; expose the
-- catalog duration in hours using asleep_seconds / 3600.0, without storing it twice.
-- V25 verifies that the header's measured_at equals ended_at.

CREATE TABLE sleep_sessions (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL DEFAULT 'sleep_hours' CHECK (indicator_code = 'sleep_hours'),
    storage_kind TEXT NOT NULL DEFAULT 'SLEEP' CHECK (storage_kind = 'SLEEP'),
    started_at TIMESTAMPTZ NOT NULL CHECK (isfinite(started_at)),
    ended_at TIMESTAMPTZ NOT NULL CHECK (isfinite(ended_at) AND ended_at > started_at),
    asleep_seconds INTEGER NOT NULL CHECK (asleep_seconds >= 0),
    CHECK (asleep_seconds <= extract(epoch FROM (ended_at - started_at))),
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT
);
