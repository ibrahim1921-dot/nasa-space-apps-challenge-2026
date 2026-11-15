-- No thresholds are seeded. Legacy rules require explicit activation.
ALTER TABLE monitoring_rules
 ADD COLUMN limit_kind TEXT NOT NULL DEFAULT 'ABSOLUTE' CHECK (limit_kind IN ('ABSOLUTE','BASELINE_DELTA')),
 ADD COLUMN designation TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK (designation IN ('CLINICAL_REFERENCE','OPERATIONAL','SYNTHETIC_DEMO'));

CREATE TABLE monitoring_rule_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 rule_id UUID NOT NULL REFERENCES monitoring_rules(id) ON DELETE RESTRICT,
 active BOOLEAN NOT NULL,
 effective_at TIMESTAMPTZ NOT NULL CHECK (isfinite(effective_at)),
 actor_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 note TEXT NOT NULL CHECK (btrim(note) <> ''),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX monitoring_rule_events_selection ON monitoring_rule_events(rule_id,effective_at DESC,id DESC);
CREATE TRIGGER monitoring_rule_events_retain BEFORE UPDATE OR DELETE ON monitoring_rule_events
 FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER monitoring_rule_events_truncate BEFORE TRUNCATE ON monitoring_rule_events
 FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE FUNCTION guard_monitoring_rule_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE rule monitoring_rules%ROWTYPE;
BEGIN
 SELECT * INTO STRICT rule FROM monitoring_rules WHERE id=NEW.rule_id FOR UPDATE;
 PERFORM 1 FROM accounts WHERE id=NEW.actor_id AND role='NASA_OFFICER' AND enabled FOR SHARE;
 IF NOT FOUND OR NEW.effective_at < statement_timestamp() THEN
  RAISE EXCEPTION 'Enabled officer and prospective activation required' USING ERRCODE='23514';
 END IF;
 IF NEW.active AND (NOT (rule.provenance ? 'approved_by' AND rule.provenance ? 'source_reference')
  OR COALESCE(btrim(rule.provenance->>'source_reference'),'')='' OR NOT EXISTS (
   SELECT 1 FROM accounts WHERE id=(rule.provenance->>'approved_by')::uuid AND role='NASA_OFFICER')) THEN
  RAISE EXCEPTION 'Traceable officer approval required before activation' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM monitoring_rule_events WHERE rule_id=NEW.rule_id AND effective_at>=NEW.effective_at) THEN
  RAISE EXCEPTION 'Activation events must advance effective time' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER monitoring_rule_event_validate BEFORE INSERT ON monitoring_rule_events
 FOR EACH ROW EXECUTE FUNCTION guard_monitoring_rule_event();

CREATE FUNCTION guard_monitoring_rule_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous monitoring_rules%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.rule_code,34));
 SELECT * INTO previous FROM monitoring_rules WHERE rule_code=NEW.rule_code ORDER BY version DESC LIMIT 1;
 IF (previous.id IS NULL AND NEW.version<>1) OR (previous.id IS NOT NULL AND
  (NEW.version<>previous.version+1 OR NEW.valid_from<=previous.valid_from OR
   ROW(NEW.astronaut_id,NEW.indicator_code,NEW.metric_code,NEW.unit,NEW.activity_context,NEW.comparison_scope_id)
   IS DISTINCT FROM ROW(previous.astronaut_id,previous.indicator_code,previous.metric_code,previous.unit,previous.activity_context,previous.comparison_scope_id))) THEN
  RAISE EXCEPTION 'Rule versions must advance within the same dimensions' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER monitoring_rule_version_validate BEFORE INSERT ON monitoring_rules
 FOR EACH ROW EXECUTE FUNCTION guard_monitoring_rule_version();
