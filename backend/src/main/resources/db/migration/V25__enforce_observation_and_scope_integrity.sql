-- One justified deferred constraint: a header must have its correct value row
-- before COMMIT (or SET CONSTRAINTS ... IMMEDIATE). Insert header then subtype
-- in one Java transaction. PK/composite FKs prevent duplicate/wrong subtypes.
-- V24 forbids later child/header mutation, so deferred checks on child changes
-- and extra concurrency locks are unnecessary. Roll back to correct an uncommitted
-- mistake; append a linked replacement to correct committed history.
-- Typed scope FKs enforce indicator compatibility; these triggers additionally
-- enforce personal radiation ownership, origin time, mood bounds and sleep time.
-- Evaluation services must still match the same scope UUID, metric, unit, context
-- and effective period when selecting baselines/rules.

CREATE FUNCTION validate_radiation_scope_owner() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE scope_owner UUID;
BEGIN
    SELECT radiation_astronaut_id INTO scope_owner FROM measurement_comparison_scopes
        WHERE id = NEW.comparison_scope_id;
    IF scope_owner IS NOT NULL AND scope_owner IS DISTINCT FROM NEW.astronaut_id THEN
        RAISE EXCEPTION 'Radiation accumulation scope belongs to another astronaut'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER health_observations_scope_owner BEFORE INSERT ON health_observations
    FOR EACH ROW EXECUTE FUNCTION validate_radiation_scope_owner();

CREATE FUNCTION validate_observation_correction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous_indicator TEXT;
BEGIN
    IF NEW.supersedes_observation_id IS NOT NULL THEN
        -- Resolve before INSERT, not at COMMIT: the predecessor must already
        -- exist, preventing cycles even in a multi-row self-referencing INSERT.
        SELECT indicator_code INTO STRICT previous_indicator FROM health_observations
            WHERE id = NEW.supersedes_observation_id;
        IF previous_indicator <> NEW.indicator_code THEN
            RAISE EXCEPTION 'Correction must retain the original indicator' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER health_observations_correction BEFORE INSERT ON health_observations
    FOR EACH ROW EXECUTE FUNCTION validate_observation_correction();

CREATE FUNCTION require_complete_health_observation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    scope_row measurement_comparison_scopes%ROWTYPE;
    has_value BOOLEAN;
BEGIN
    SELECT * INTO STRICT scope_row FROM measurement_comparison_scopes WHERE id = NEW.comparison_scope_id;
    has_value := CASE NEW.storage_kind
        WHEN 'SCALAR' THEN EXISTS (SELECT 1 FROM health_measurements WHERE observation_id = NEW.id)
        WHEN 'BLOOD_PRESSURE' THEN EXISTS (SELECT 1 FROM blood_pressure_observations WHERE observation_id = NEW.id)
        WHEN 'SLEEP' THEN EXISTS (SELECT 1 FROM sleep_sessions WHERE observation_id = NEW.id AND ended_at = NEW.measured_at)
        WHEN 'MOOD' THEN EXISTS (SELECT 1 FROM mood_assessments WHERE observation_id = NEW.id AND score BETWEEN scope_row.scale_min AND scope_row.scale_max)
        WHEN 'MUSCLE' THEN EXISTS (SELECT 1 FROM muscle_assessments WHERE observation_id = NEW.id)
        WHEN 'BONE' THEN EXISTS (SELECT 1 FROM bone_density_examinations WHERE observation_id = NEW.id)
        ELSE FALSE END;
    IF NOT has_value THEN
        RAISE EXCEPTION 'Observation % requires a compatible % value record', NEW.id, NEW.storage_kind USING ERRCODE = '23514';
    END IF;
    IF scope_row.accumulation_started_at > NEW.measured_at THEN
        RAISE EXCEPTION 'Radiation accumulation cannot start after measurement' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER health_observations_complete AFTER INSERT ON health_observations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_complete_health_observation();

CREATE TRIGGER personal_baselines_scope_owner BEFORE INSERT ON personal_baselines
    FOR EACH ROW EXECUTE FUNCTION validate_radiation_scope_owner();

CREATE TRIGGER monitoring_rules_scope_owner BEFORE INSERT ON monitoring_rules
    FOR EACH ROW EXECUTE FUNCTION validate_radiation_scope_owner();
