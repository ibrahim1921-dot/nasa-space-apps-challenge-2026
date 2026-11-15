-- Mood scale identity/version/bounds live in the shared immutable scope.
-- V25 checks the score against those bounds at transaction completion.

CREATE TABLE mood_assessments (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL DEFAULT 'mood' CHECK (indicator_code = 'mood'),
    storage_kind TEXT NOT NULL DEFAULT 'MOOD' CHECK (storage_kind = 'MOOD'),
    score NUMERIC(12,4) NOT NULL CHECK (score > '-Infinity'::numeric AND score < 'Infinity'::numeric),
    unit TEXT NOT NULL DEFAULT 'score' CHECK (unit = 'score'),
    notes TEXT,
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT
);
