-- Retain assessment identities/inputs and completed results. Running execution
-- cannot move backward or rewrite its start time. A failed-before-run assessment
-- may record identical start/completion timestamps; services define retry policy
-- using a NEW assessment row. RULE_ALERT must reference a rule-triggered alert.
-- Model result semantics, source/simulation provenance and cross-record mission
-- consistency remain service validation responsibilities.

CREATE FUNCTION preserve_assessment_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Assessments must be retained' USING ERRCODE = '23514';
    END IF;
    IF OLD.status IN ('SUCCEEDED', 'FAILED') OR
        (to_jsonb(NEW) - ARRAY['status', 'started_at', 'completed_at', 'result_schema_version', 'result', 'error_message'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status', 'started_at', 'completed_at', 'result_schema_version', 'result', 'error_message']) THEN
        RAISE EXCEPTION 'Assessment identity/inputs and completed results are immutable' USING ERRCODE = '23514';
    END IF;
    IF (OLD.status = 'RUNNING' AND NEW.status NOT IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
        OR (OLD.started_at IS NOT NULL AND OLD.started_at IS DISTINCT FROM NEW.started_at) THEN
        RAISE EXCEPTION 'Assessment execution cannot move backward or rewrite its start time' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ml_assessments_retain BEFORE UPDATE OR DELETE ON ml_health_assessments
    FOR EACH ROW EXECUTE FUNCTION preserve_assessment_history();

CREATE FUNCTION validate_assessment_trigger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.assessment_trigger = 'RULE_ALERT' AND NOT EXISTS (
        SELECT 1 FROM health_alerts WHERE id = NEW.related_alert_id AND trigger_kind = 'RULE') THEN
        RAISE EXCEPTION 'RULE_ALERT assessment must reference a rule-triggered alert' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ml_assessments_trigger_source BEFORE INSERT ON ml_health_assessments
    FOR EACH ROW EXECUTE FUNCTION validate_assessment_trigger();
