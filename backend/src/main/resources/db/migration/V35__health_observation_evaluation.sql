-- No backfill, thresholds, baselines or automatic activation.
ALTER TABLE health_alerts ADD COLUMN is_synthetic BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE health_evaluation_outbox (
 observation_id UUID PRIMARY KEY REFERENCES health_observations(id) ON DELETE RESTRICT,
 queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX health_evaluation_pending ON health_evaluation_outbox(next_attempt_at,queued_at) WHERE completed_at IS NULL;
CREATE TABLE health_evaluation_failures (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 observation_id UUID NOT NULL REFERENCES health_evaluation_outbox(observation_id) ON DELETE RESTRICT,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reason TEXT NOT NULL CHECK(reason='EVALUATION_FAILED')
);
CREATE TABLE health_observation_evaluations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 observation_id UUID NOT NULL,
 astronaut_id UUID NOT NULL,
 metric_code TEXT NOT NULL,
 unit TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('WITHIN_BOUNDS','ALERT_CREATED','MISSING_RULE','CONFLICT','DEMO_DISABLED',
  'MISSING_BASELINE','INVALID_BASELINE_BOUNDS','INVALID_RULE','BASELINE_CONFLICT','SUPERSEDED','SYNTHETIC_MISMATCH','METRIC_UNAVAILABLE','INVALID_RADIATION')),
 rule_id UUID REFERENCES monitoring_rules(id) ON DELETE RESTRICT,
 baseline_id UUID REFERENCES personal_baselines(id) ON DELETE RESTRICT,
 alert_id UUID UNIQUE REFERENCES health_alerts(id) ON DELETE RESTRICT,
 evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 UNIQUE(observation_id,metric_code),
 FOREIGN KEY(observation_id,astronaut_id) REFERENCES health_observations(id,astronaut_id) ON DELETE RESTRICT,
 CHECK((outcome='ALERT_CREATED')=(alert_id IS NOT NULL))
);
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['health_observation_evaluations','health_evaluation_failures'] LOOP
  EXECUTE format('CREATE TRIGGER retain_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation()',tab);
  EXECUTE format('CREATE TRIGGER retain_history_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation()',tab);
 END LOOP;
END $$;
CREATE FUNCTION preserve_health_evaluation_job() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Evaluation jobs must be retained' USING ERRCODE='23514'; END IF;
 IF OLD.completed_at IS NOT NULL OR NEW.observation_id<>OLD.observation_id OR NEW.queued_at<>OLD.queued_at
  OR NEW.attempts<OLD.attempts OR NEW.next_attempt_at<OLD.next_attempt_at THEN
  RAISE EXCEPTION 'Evaluation job identity and completed jobs are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evaluation_job_retain BEFORE UPDATE OR DELETE ON health_evaluation_outbox FOR EACH ROW EXECUTE FUNCTION preserve_health_evaluation_job();
CREATE TRIGGER evaluation_job_truncate BEFORE TRUNCATE ON health_evaluation_outbox FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
