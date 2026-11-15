-- Persistence foundation only: no profiles, accounts, scopes or measurements are seeded.
-- One capture binds one exported engine run in one API workspace. Neither engine
-- run IDs nor workspace IDs are globally unique capture keys: independent captures are valid.
CREATE TABLE simulation_captures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    engine_run_id UUID NOT NULL,
    created_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
    manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(created_at)),
    activated_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    CHECK ((status = 'DRAFT' AND activated_at IS NULL AND closed_at IS NULL)
        OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND closed_at IS NULL)
        OR (status = 'CLOSED' AND activated_at IS NOT NULL AND closed_at IS NOT NULL)),
    CHECK (activated_at IS NULL OR (isfinite(activated_at) AND activated_at >= created_at)),
    CHECK (closed_at IS NULL OR (isfinite(closed_at) AND closed_at >= activated_at))
);
CREATE INDEX simulation_captures_workspace_run_idx ON simulation_captures (workspace_id, engine_run_id);
CREATE INDEX simulation_captures_creator_idx ON simulation_captures (created_by_account_id, created_at);

CREATE TABLE simulation_profile_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capture_id UUID NOT NULL REFERENCES simulation_captures(id) ON DELETE RESTRICT,
    simulation_astronaut_id UUID NOT NULL,
    simulation_crew_code TEXT NOT NULL CHECK (btrim(simulation_crew_code) <> ''),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    -- Deliberate MVP allowlist, matching DemoAccountProvisioner, not a name-based inference.
    target_crew_code TEXT NOT NULL CHECK (target_crew_code IN ('crew-01', 'crew-02', 'crew-03', 'crew-04')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(created_at)),
    UNIQUE (capture_id, simulation_astronaut_id),
    UNIQUE (capture_id, simulation_crew_code),
    UNIQUE (capture_id, astronaut_id),
    UNIQUE (id, capture_id, astronaut_id)
);
CREATE INDEX simulation_profile_mappings_astronaut_idx ON simulation_profile_mappings (astronaut_id);

CREATE TABLE simulation_ingestion_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capture_id UUID NOT NULL REFERENCES simulation_captures(id) ON DELETE RESTRICT,
    profile_mapping_id UUID NOT NULL,
    astronaut_id UUID NOT NULL,
    source_record_id TEXT NOT NULL CHECK (btrim(source_record_id) <> '' AND length(source_record_id) <= 256),
    export_sequence BIGINT NOT NULL CHECK (export_sequence > 0),
    -- SHA-256 of a versioned canonical payload; not a password/credential hash.
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    canonicalization_version TEXT NOT NULL CHECK (btrim(canonicalization_version) <> ''),
    observation_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(created_at)),
    UNIQUE (capture_id, source_record_id),
    UNIQUE (capture_id, export_sequence),
    FOREIGN KEY (profile_mapping_id, capture_id, astronaut_id)
        REFERENCES simulation_profile_mappings(id, capture_id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (observation_id, astronaut_id)
        REFERENCES health_observations(id, astronaut_id) ON DELETE RESTRICT
);
CREATE INDEX simulation_ingestion_receipts_mapping_idx ON simulation_ingestion_receipts (profile_mapping_id, capture_id, astronaut_id);
CREATE INDEX simulation_ingestion_receipts_astronaut_idx ON simulation_ingestion_receipts (astronaut_id);

CREATE FUNCTION preserve_simulation_capture() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Simulation captures must be retained' USING ERRCODE = '23514';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'DRAFT' OR NOT EXISTS (SELECT 1 FROM accounts
                WHERE id = NEW.created_by_account_id AND role = 'NASA_OFFICER' AND enabled) THEN
            RAISE EXCEPTION 'Capture registration requires an enabled officer and DRAFT state' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF (to_jsonb(NEW) - ARRAY['status', 'activated_at', 'closed_at', 'version'])
            IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'activated_at', 'closed_at', 'version'])
            OR NEW.version < OLD.version THEN
            RAISE EXCEPTION 'Capture identity, creator and manifest are immutable' USING ERRCODE = '23514';
        END IF;
        IF NOT ((OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' AND EXISTS (
                    SELECT 1 FROM simulation_profile_mappings WHERE capture_id = OLD.id))
            OR (OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED' AND NEW.activated_at = OLD.activated_at)) THEN
            RAISE EXCEPTION 'Only DRAFT to ACTIVE with mappings, then ACTIVE to CLOSED is allowed' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER simulation_captures_state BEFORE INSERT OR UPDATE OR DELETE ON simulation_captures
    FOR EACH ROW EXECUTE FUNCTION preserve_simulation_capture();

CREATE FUNCTION validate_simulation_mapping() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE capture_status TEXT;
BEGIN
    -- Lock the parent to serialize mapping registration against activation/receipt writes.
    SELECT status INTO capture_status FROM simulation_captures WHERE id = NEW.capture_id FOR UPDATE;
    IF capture_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION 'Mappings may only be added to a DRAFT capture' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM astronauts WHERE id = NEW.astronaut_id AND crew_code = NEW.target_crew_code
        AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mapping requires an existing active allowlisted demo destination' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER simulation_mappings_validate BEFORE INSERT ON simulation_profile_mappings
    FOR EACH ROW EXECUTE FUNCTION validate_simulation_mapping();

CREATE FUNCTION validate_simulation_receipt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE capture_row simulation_captures%ROWTYPE;
BEGIN
    SELECT * INTO capture_row FROM simulation_captures WHERE id = NEW.capture_id FOR UPDATE;
    IF capture_row.status IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'New receipts require an ACTIVE capture' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM health_observations WHERE id = NEW.observation_id
        AND astronaut_id = NEW.astronaut_id AND source_kind = 'SIMULATION'
        AND source_record_id = NEW.source_record_id
        AND simulation_metadata ->> 'run_id' = capture_row.engine_run_id::text
        AND simulation_metadata ->> 'workspace_id' = capture_row.workspace_id::text;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receipt must reference its matching synthetic observation, run and workspace' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER simulation_receipts_validate BEFORE INSERT ON simulation_ingestion_receipts
    FOR EACH ROW EXECUTE FUNCTION validate_simulation_receipt();

-- Immutable from registration, stronger than merely immutable after first use.
CREATE TRIGGER simulation_mappings_retain BEFORE UPDATE OR DELETE ON simulation_profile_mappings
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER simulation_receipts_retain BEFORE UPDATE OR DELETE ON simulation_ingestion_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER simulation_captures_no_truncate BEFORE TRUNCATE ON simulation_captures
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER simulation_mappings_no_truncate BEFORE TRUNCATE ON simulation_profile_mappings
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER simulation_receipts_no_truncate BEFORE TRUNCATE ON simulation_ingestion_receipts
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
