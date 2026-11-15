-- Main astronaut forms, independent of simulation capture ingestion. Raw form
-- submissions are retained even when no compatible observation representation
-- exists (daily sleep estimates and six-field night summaries are not sessions).
CREATE TABLE astronaut_assessment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('CHECKIN','SLEEP_LOG','STAND_TEST')),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    idempotency_key UUID NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL CHECK (isfinite(recorded_at)),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    source_kind TEXT NOT NULL DEFAULT 'SELF_REPORT' CHECK (source_kind = 'SELF_REPORT'),
    source_name TEXT NOT NULL CHECK (source_name IN ('daily-checkin-v1','sleep-log-v1','stand-test-v1')),
    request JSONB NOT NULL CHECK (jsonb_typeof(request) = 'object'),
    provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
    checkin_id UUID UNIQUE,
    FOREIGN KEY (checkin_id, astronaut_id) REFERENCES astronaut_checkins(id, astronaut_id) ON DELETE RESTRICT,
    CHECK ((kind = 'CHECKIN') = (checkin_id IS NOT NULL)),
    CHECK ((kind = 'CHECKIN' AND source_name = 'daily-checkin-v1'
            AND request ?& ARRAY['recordedAt','reading','context'])
        OR (kind = 'SLEEP_LOG' AND source_name = 'sleep-log-v1'
            AND request ?& ARRAY['recordedAt','date','night'])
        OR (kind = 'STAND_TEST' AND source_name = 'stand-test-v1'
            AND request ?& ARRAY['recordedAt','test'])),
    UNIQUE (astronaut_id, kind, idempotency_key),
    UNIQUE (id, astronaut_id)
);
CREATE INDEX astronaut_assessment_history ON astronaut_assessment_submissions
    (astronaut_id, kind, recorded_at DESC, id DESC);

CREATE TABLE astronaut_assessment_observations (
    submission_id UUID NOT NULL,
    astronaut_id UUID NOT NULL,
    observation_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (submission_id, observation_id),
    FOREIGN KEY (submission_id, astronaut_id) REFERENCES astronaut_assessment_submissions(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (observation_id, astronaut_id) REFERENCES health_observations(id, astronaut_id) ON DELETE RESTRICT
);

CREATE TRIGGER retain_history BEFORE UPDATE OR DELETE ON astronaut_assessment_submissions
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER retain_history_truncate BEFORE TRUNCATE ON astronaut_assessment_submissions
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER retain_history BEFORE UPDATE OR DELETE ON astronaut_assessment_observations
    FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER retain_history_truncate BEFORE TRUNCATE ON astronaut_assessment_observations
    FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
