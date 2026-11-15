-- Transactional lifecycle snapshots and evidence attachment events. Failed
-- operations/rolled-back transactions do not leave durable audit events; use
-- server/application logs for rejected attempts. No-op alert updates add no event.
-- astrohealth.actor must be set transaction-locally by trusted authentication
-- code; session_user is the fallback. Runtime SQL access must remain service-only.
-- Audit INSERT privileges and actor authenticity are deployment responsibilities;
-- this is not tamper-proof against a privileged DB client. V24 blocks event edits.

CREATE FUNCTION audit_health_alert() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    audit_actor TEXT;
    audit_kind TEXT;
BEGIN
    audit_actor := COALESCE(NULLIF(current_setting('astrohealth.actor', true), ''), session_user);
    IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
        RETURN NEW;
    END IF;
    audit_kind := CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE NEW.status END;
    IF TG_OP = 'INSERT' THEN
        INSERT INTO health_alert_events (alert_id, actor, event_kind, details)
        VALUES (NEW.id, audit_actor, audit_kind, jsonb_build_object('after', to_jsonb(NEW)));
    ELSE
        INSERT INTO health_alert_events (alert_id, actor, event_kind, details)
        VALUES (NEW.id, audit_actor, audit_kind, jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER health_alerts_audit AFTER INSERT OR UPDATE ON health_alerts
    FOR EACH ROW EXECUTE FUNCTION audit_health_alert();

CREATE FUNCTION audit_alert_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO health_alert_events (alert_id, actor, event_kind, details)
    VALUES (NEW.alert_id, COALESCE(NULLIF(current_setting('astrohealth.actor', true), ''), session_user),
        'EVIDENCE_ADDED', jsonb_build_object('observation_id', NEW.observation_id));
    RETURN NEW;
END;
$$;

CREATE TRIGGER alert_observations_audit AFTER INSERT ON alert_observations
    FOR EACH ROW EXECUTE FUNCTION audit_alert_evidence();
