-- Shared observation envelope for all scalar and specialized values.
-- measured_at and ingested_at have distinct meanings. No clinical cadence is
-- imposed. Supply checkin_id at insertion; headers become immutable in V24.
-- Corrections append a full replacement with a reason and predecessor link.

CREATE TABLE health_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    astronaut_mission_id UUID,
    checkin_id UUID,
    indicator_code TEXT NOT NULL,
    storage_kind TEXT NOT NULL,
    comparison_scope_id UUID NOT NULL,
    activity_context TEXT NOT NULL DEFAULT 'UNKNOWN',
    measured_at TIMESTAMPTZ NOT NULL CHECK (isfinite(measured_at)),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(ingested_at)),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('DEVICE', 'CLINICAL', 'SELF_REPORT', 'IMPORT', 'SIMULATION')),
    source_name TEXT NOT NULL CHECK (btrim(source_name) <> ''),
    source_record_id TEXT,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
    simulation_metadata JSONB CHECK (jsonb_typeof(simulation_metadata) = 'object'),
    supersedes_observation_id UUID UNIQUE,
    correction_reason TEXT CHECK (btrim(correction_reason) <> ''),
    FOREIGN KEY (astronaut_mission_id, astronaut_id) REFERENCES astronaut_missions(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, storage_kind) REFERENCES health_indicators(code, storage_kind) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, activity_context) REFERENCES indicator_contexts ON DELETE RESTRICT,
    FOREIGN KEY (comparison_scope_id, indicator_code) REFERENCES measurement_comparison_scopes(id, indicator_code) ON DELETE RESTRICT,
    CHECK ((source_kind = 'SIMULATION') = (simulation_metadata IS NOT NULL)),
    UNIQUE (id, indicator_code, storage_kind),
    UNIQUE (id, astronaut_id),
    FOREIGN KEY (supersedes_observation_id, astronaut_id) REFERENCES health_observations(id, astronaut_id) ON DELETE RESTRICT,
    CHECK ((supersedes_observation_id IS NOT NULL) = (correction_reason IS NOT NULL)),
    CHECK (supersedes_observation_id IS NULL OR supersedes_observation_id <> id),
    CONSTRAINT health_observations_checkin_fk FOREIGN KEY (checkin_id, astronaut_id)
        REFERENCES astronaut_checkins(id, astronaut_id) ON DELETE RESTRICT
);

CREATE INDEX health_observations_series_idx ON health_observations
    (astronaut_id, indicator_code, activity_context, measured_at DESC);

CREATE INDEX health_observations_mission_idx ON health_observations (astronaut_mission_id, measured_at DESC);

CREATE INDEX health_observations_ingestion_idx ON health_observations (ingested_at);

CREATE INDEX health_observations_indicator_history_idx ON health_observations (astronaut_id, indicator_code, measured_at DESC);

CREATE INDEX health_observations_scope_idx ON health_observations (comparison_scope_id);

CREATE INDEX health_observations_checkin_idx ON health_observations (checkin_id);
