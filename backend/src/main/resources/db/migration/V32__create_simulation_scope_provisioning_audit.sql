-- Audit infrastructure only. No scopes, accounts, astronauts, baselines or medical limits are seeded.
-- Scope creation remains an explicit authenticated development command, never application startup.
CREATE TABLE simulation_scope_provisioning_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invocation_id UUID NOT NULL,
    capture_id UUID NOT NULL REFERENCES simulation_captures(id) ON DELETE RESTRICT,
    actor_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    profile_mapping_id UUID REFERENCES simulation_profile_mappings(id) ON DELETE RESTRICT,
    scope_id UUID NOT NULL,
    indicator_code TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    unit TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CREATED', 'VERIFIED')),
    definition_version TEXT NOT NULL CHECK (definition_version = 'astrohealth.simulation.scopes.v1'),
    definition JSONB NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
    database_actor TEXT NOT NULL DEFAULT session_user CHECK (btrim(database_actor) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP CHECK (isfinite(created_at)),
    FOREIGN KEY (scope_id, indicator_code) REFERENCES measurement_comparison_scopes(id, indicator_code) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, metric_code, unit) REFERENCES indicator_metrics(indicator_code, metric_code, unit) ON DELETE RESTRICT,
    UNIQUE (invocation_id, scope_id)
);
CREATE INDEX simulation_scope_audit_capture_idx ON simulation_scope_provisioning_audit(capture_id, created_at);
CREATE INDEX simulation_scope_audit_actor_idx ON simulation_scope_provisioning_audit(actor_account_id, created_at);
CREATE INDEX simulation_scope_audit_mapping_idx ON simulation_scope_provisioning_audit(profile_mapping_id);

CREATE FUNCTION validate_simulation_scope_approval() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    capture_row simulation_captures%ROWTYPE;
    scope_row measurement_comparison_scopes%ROWTYPE;
    mapping_row simulation_profile_mappings%ROWTYPE;
    approved BOOLEAN;
BEGIN
    PERFORM 1 FROM accounts WHERE id = NEW.actor_account_id AND role = 'NASA_OFFICER' AND enabled FOR SHARE;
    IF NOT FOUND OR NEW.database_actor <> session_user THEN
        RAISE EXCEPTION 'Scope approval requires an enabled officer' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO STRICT capture_row FROM simulation_captures WHERE id = NEW.capture_id FOR SHARE;
    IF capture_row.created_by_account_id <> NEW.actor_account_id OR capture_row.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Scope approval requires the active capture creator' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO STRICT scope_row FROM measurement_comparison_scopes WHERE id = NEW.scope_id;
    IF NEW.definition IS DISTINCT FROM to_jsonb(scope_row) THEN
        RAISE EXCEPTION 'Scope audit must retain the exact immutable definition' USING ERRCODE = '23514';
    END IF;
    IF scope_row.indicator_code = 'cumulative_absorbed_radiation_dose' THEN
        SELECT * INTO STRICT mapping_row FROM simulation_profile_mappings WHERE id = NEW.profile_mapping_id;
        PERFORM 1 FROM astronauts WHERE id = mapping_row.astronaut_id AND crew_code = mapping_row.target_crew_code
            AND crew_code IN ('crew-01','crew-02','crew-03','crew-04') AND archived_at IS NULL FOR SHARE;
        IF NOT FOUND OR mapping_row.capture_id <> NEW.capture_id
                OR scope_row.radiation_astronaut_id IS DISTINCT FROM mapping_row.astronaut_id
                OR scope_row.scope_code <> 'simulation-capture-' || NEW.capture_id || '-' || mapping_row.astronaut_id
                OR scope_row.accumulation_started_at IS DISTINCT FROM
                    (capture_row.manifest #>> '{run_manifest,configuration,start_at}')::timestamptz
                OR scope_row.body_site <> 'WHOLE_BODY' OR scope_row.dosimetry_method <> 'SYNTHETIC_DEMO_ABSORBED_DOSE'
                OR NEW.metric_code <> 'value' THEN
            RAISE EXCEPTION 'Radiation approval must match the active demo capture mapping and origin' USING ERRCODE = '23514';
        END IF;
    ELSE
        approved := CASE scope_row.scope_code
            WHEN 'simulation-mood-v1' THEN NEW.metric_code = 'score' AND to_jsonb(scope_row) @>
                '{"indicator_code":"mood","storage_kind":"MOOD","scale_name":"SYNTHETIC_DEMO_MOOD","scale_version":"1","scale_min":1,"scale_max":5}'::jsonb
            WHEN 'simulation-grip_strength-v1' THEN NEW.metric_code = 'grip_strength' AND to_jsonb(scope_row) @>
                '{"indicator_code":"muscle","storage_kind":"MUSCLE","body_site":"DOMINANT_HAND","protocol_code":"SYNTHETIC_DEMO_GRIP","protocol_version":"1"}'::jsonb
            WHEN 'simulation-muscle_mass-v1' THEN NEW.metric_code = 'muscle_mass' AND to_jsonb(scope_row) @>
                '{"indicator_code":"muscle","storage_kind":"MUSCLE","body_site":"WHOLE_BODY","protocol_code":"SYNTHETIC_DEMO_MUSCLE_MASS","protocol_version":"1"}'::jsonb
            WHEN 'simulation-bone-v1' THEN NEW.metric_code = 'areal_density' AND to_jsonb(scope_row) @>
                '{"indicator_code":"bone_mineral_density","storage_kind":"BONE","body_site":"LUMBAR_SPINE","protocol_code":"SYNTHETIC_DEMO_AREAL_DENSITY","protocol_version":"1"}'::jsonb
            ELSE FALSE END;
        IF NEW.profile_mapping_id IS NOT NULL OR NOT approved THEN
            RAISE EXCEPTION 'Only fixed demo technical definitions may be approved' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER simulation_scope_audit_validate BEFORE INSERT ON simulation_scope_provisioning_audit
    FOR EACH ROW EXECUTE FUNCTION validate_simulation_scope_approval();
CREATE TRIGGER simulation_scope_audit_retain BEFORE UPDATE OR DELETE ON simulation_scope_provisioning_audit
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER simulation_scope_audit_no_truncate BEFORE TRUNCATE ON simulation_scope_provisioning_audit
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
