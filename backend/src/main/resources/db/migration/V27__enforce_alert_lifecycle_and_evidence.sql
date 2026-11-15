-- Deliberate lifecycle policy: insert OPEN, then ACKNOWLEDGED, then RESOLVED.
-- No direct resolution, reopening, severity/trigger edits or timestamp rewrites.
-- These are reviewable prototype rules, not clinical policy. New evidence is
-- allowed only while OPEN, and locks the parent against concurrent transitions.
-- Existing evidence never changes; a corrected reading does not rewrite an alert.
-- Rule alerts check owner/severity/validity at insertion; evidence checks scope,
-- context and availability of the selected muscle metric. Services evaluate actual
-- threshold breaches, require sufficient evidence, and validate mission consistency.

CREATE FUNCTION enforce_health_alert_lifecycle() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rule_row monitoring_rules%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Alerts must be retained' USING ERRCODE = '23514';
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'OPEN' THEN
            RAISE EXCEPTION 'Alerts must start OPEN' USING ERRCODE = '23514';
        END IF;
        IF NEW.trigger_kind = 'RULE' THEN
            SELECT * INTO STRICT rule_row FROM monitoring_rules WHERE id = NEW.monitoring_rule_id;
            IF (rule_row.astronaut_id IS NOT NULL AND rule_row.astronaut_id <> NEW.astronaut_id)
                OR NEW.severity <> rule_row.severity
                OR NEW.triggered_at < rule_row.valid_from
                OR (rule_row.valid_to IS NOT NULL AND NEW.triggered_at >= rule_row.valid_to) THEN
                RAISE EXCEPTION 'Rule alert must match rule owner, severity and validity period' USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.trigger_kind = 'ML' THEN
            IF NOT EXISTS (SELECT 1 FROM ml_health_assessments WHERE id = NEW.ml_assessment_id AND status = 'SUCCEEDED') THEN
                RAISE EXCEPTION 'ML alerts require a successful assessment' USING ERRCODE = '23514';
            END IF;
        END IF;
    ELSE
        IF NEW IS NOT DISTINCT FROM OLD THEN
            RETURN NEW;
        END IF;
        IF (to_jsonb(NEW) - ARRAY['status', 'acknowledged_at', 'acknowledged_by',
            'resolved_at', 'resolved_by', 'resolution_note']) IS DISTINCT FROM
            (to_jsonb(OLD) - ARRAY['status', 'acknowledged_at', 'acknowledged_by',
            'resolved_at', 'resolved_by', 'resolution_note']) THEN
            RAISE EXCEPTION 'Original alert identity and trigger information are immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.status = 'OPEN' AND NEW.status = 'ACKNOWLEDGED' THEN
            IF NEW.resolution_note IS DISTINCT FROM OLD.resolution_note THEN
                RAISE EXCEPTION 'Resolution information may be set only at resolution' USING ERRCODE = '23514';
            END IF;
        ELSIF OLD.status = 'ACKNOWLEDGED' AND NEW.status = 'RESOLVED' THEN
            IF ROW(NEW.acknowledged_at, NEW.acknowledged_by) IS DISTINCT FROM
                ROW(OLD.acknowledged_at, OLD.acknowledged_by) THEN
                RAISE EXCEPTION 'Acknowledgment history is immutable' USING ERRCODE = '23514';
            END IF;
        ELSE
            RAISE EXCEPTION 'Invalid alert transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER health_alerts_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON health_alerts
    FOR EACH ROW EXECUTE FUNCTION enforce_health_alert_lifecycle();

CREATE FUNCTION attach_alert_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    alert_row health_alerts%ROWTYPE;
    rule_row monitoring_rules%ROWTYPE;
    observation_row health_observations%ROWTYPE;
BEGIN
    SELECT * INTO STRICT alert_row FROM health_alerts WHERE id = NEW.alert_id FOR UPDATE;
    IF alert_row.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Evidence may only be attached to an OPEN alert' USING ERRCODE = '23514';
    END IF;
    IF alert_row.trigger_kind = 'RULE' THEN
        SELECT * INTO STRICT rule_row FROM monitoring_rules WHERE id = alert_row.monitoring_rule_id;
        SELECT * INTO STRICT observation_row FROM health_observations WHERE id = NEW.observation_id;
        IF ROW(observation_row.indicator_code, observation_row.comparison_scope_id, observation_row.activity_context)
            IS DISTINCT FROM ROW(rule_row.indicator_code, rule_row.comparison_scope_id, rule_row.activity_context) THEN
            RAISE EXCEPTION 'Rule evidence must match indicator, comparison scope and activity context' USING ERRCODE = '23514';
        END IF;
        IF rule_row.indicator_code = 'muscle' AND NOT EXISTS (
            SELECT 1 FROM muscle_assessments WHERE observation_id = NEW.observation_id
                AND CASE rule_row.metric_code WHEN 'grip_strength' THEN grip_strength_kgf IS NOT NULL
                    WHEN 'muscle_mass' THEN muscle_mass_kg IS NOT NULL ELSE FALSE END) THEN
            RAISE EXCEPTION 'Evidence lacks the muscle metric evaluated by the rule' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER alert_observations_attach BEFORE INSERT ON alert_observations
    FOR EACH ROW EXECUTE FUNCTION attach_alert_evidence();
