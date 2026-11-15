-- Shared append-only guards, crew identity protection and TRUNCATE protection.
-- These apply before the cross-table validators in subsequent migrations; do not
-- expose a partially migrated schema to writers. Apply the full sequence first.
-- Owners/superusers remain trusted. Deployment must separate migration ownership
-- from runtime access and prohibit trigger disabling/DDL. No roles are invented.

CREATE FUNCTION reject_historical_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; append a correction instead', TG_TABLE_NAME
        USING ERRCODE = '23514';
END;
$$;

CREATE FUNCTION preserve_crew_identity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.crew_code IS DISTINCT FROM OLD.crew_code THEN
        RAISE EXCEPTION 'Astronaut UUID and crew_code are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER astronauts_identity BEFORE UPDATE ON astronauts
    FOR EACH ROW EXECUTE FUNCTION preserve_crew_identity();

CREATE TRIGGER measurement_scopes_immutable BEFORE UPDATE OR DELETE ON measurement_comparison_scopes
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER measurement_scopes_no_truncate BEFORE TRUNCATE ON measurement_comparison_scopes
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

DO $$
DECLARE relation_name TEXT;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY['health_observations', 'health_measurements',
        'blood_pressure_observations', 'sleep_sessions', 'mood_assessments',
        'muscle_assessments', 'bone_density_examinations', 'health_indicators',
        'indicator_metrics', 'indicator_contexts']
    LOOP
        EXECUTE format('CREATE TRIGGER retain_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation()', relation_name);
        EXECUTE format('CREATE TRIGGER retain_history_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation()', relation_name);
    END LOOP;
END;
$$;

CREATE TRIGGER personal_baselines_no_truncate BEFORE TRUNCATE ON personal_baselines
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER monitoring_rules_no_truncate BEFORE TRUNCATE ON monitoring_rules
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER health_alert_events_retain BEFORE UPDATE OR DELETE ON health_alert_events
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER health_alert_events_no_truncate BEFORE TRUNCATE ON health_alert_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER health_alerts_no_truncate BEFORE TRUNCATE ON health_alerts
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER alert_observations_retain BEFORE UPDATE OR DELETE ON alert_observations
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER alert_observations_no_truncate BEFORE TRUNCATE ON alert_observations
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER astronaut_checkins_retain BEFORE UPDATE OR DELETE ON astronaut_checkins
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER astronaut_checkins_no_truncate BEFORE TRUNCATE ON astronaut_checkins
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();

CREATE TRIGGER ml_assessments_no_truncate BEFORE TRUNCATE ON ml_health_assessments
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
