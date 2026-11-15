-- Preserve baseline/rule version contents. Only close a previously open validity
-- interval once; changing values requires a new version. Baseline correction links
-- must advance exactly one version in the same comparison series.
-- Services serialize close/append transactions, reject overlapping periods and
-- prevent validity closure that retroactively invalidates recorded evaluations.
-- This avoids extension-dependent exclusion constraints for the prototype.

CREATE FUNCTION preserve_reference_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE end_column TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Reference versions must be retained' USING ERRCODE = '23514';
    END IF;
    end_column := CASE WHEN TG_TABLE_NAME = 'personal_baselines' THEN 'effective_to' ELSE 'valid_to' END;
    IF (to_jsonb(NEW) - end_column) IS DISTINCT FROM (to_jsonb(OLD) - end_column)
        OR (to_jsonb(OLD) ->> end_column) IS NOT NULL
        OR (to_jsonb(NEW) ->> end_column) IS NULL THEN
        RAISE EXCEPTION 'Only closing an open reference validity interval is allowed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER personal_baselines_retain BEFORE UPDATE OR DELETE ON personal_baselines
    FOR EACH ROW EXECUTE FUNCTION preserve_reference_version();

CREATE TRIGGER monitoring_rules_retain BEFORE UPDATE OR DELETE ON monitoring_rules
    FOR EACH ROW EXECUTE FUNCTION preserve_reference_version();

CREATE FUNCTION validate_baseline_correction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous personal_baselines%ROWTYPE;
BEGIN
    IF NEW.supersedes_baseline_id IS NOT NULL THEN
        SELECT * INTO STRICT previous FROM personal_baselines WHERE id = NEW.supersedes_baseline_id;
        IF ROW(NEW.astronaut_id, NEW.indicator_code, NEW.metric_code, NEW.activity_context,
            NEW.comparison_scope_id, NEW.baseline_kind, NEW.version)
            IS DISTINCT FROM ROW(previous.astronaut_id, previous.indicator_code, previous.metric_code,
                previous.activity_context, previous.comparison_scope_id, previous.baseline_kind, previous.version + 1) THEN
            RAISE EXCEPTION 'Baseline correction must be the next version in the same comparison scope' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER personal_baselines_correction BEFORE INSERT ON personal_baselines
    FOR EACH ROW EXECUTE FUNCTION validate_baseline_correction();
