-- Reuse V21 assessment execution/result history and V29 immutability unchanged.
-- This table adds request identity/actor evidence; no clinical rules or ML alerts.
CREATE TABLE ml_assessment_requests (
 assessment_id UUID PRIMARY KEY,
 astronaut_id UUID NOT NULL,
 requested_by_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 request_sha256 TEXT NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 input_mode TEXT NOT NULL CHECK(input_mode IN ('OBSERVATIONS','EXPLICIT_SYNTHETIC_VECTOR')),
 is_synthetic BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(astronaut_id,request_key),
 FOREIGN KEY(assessment_id,astronaut_id) REFERENCES ml_health_assessments(id,astronaut_id) ON DELETE RESTRICT,
 CHECK(input_mode<>'EXPLICIT_SYNTHETIC_VECTOR' OR is_synthetic)
);
CREATE TABLE ml_assessment_observations (
 assessment_id UUID NOT NULL, astronaut_id UUID NOT NULL, observation_id UUID NOT NULL,
 PRIMARY KEY(assessment_id,observation_id),
 FOREIGN KEY(assessment_id,astronaut_id) REFERENCES ml_health_assessments(id,astronaut_id) ON DELETE RESTRICT,
 FOREIGN KEY(observation_id,astronaut_id) REFERENCES health_observations(id,astronaut_id) ON DELETE RESTRICT
);
CREATE TRIGGER ml_request_history BEFORE UPDATE OR DELETE ON ml_assessment_requests FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER ml_request_no_truncate BEFORE TRUNCATE ON ml_assessment_requests FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER ml_input_history BEFORE UPDATE OR DELETE ON ml_assessment_observations FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation();
CREATE TRIGGER ml_input_no_truncate BEFORE TRUNCATE ON ml_assessment_observations FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation();
CREATE INDEX ml_requests_actor ON ml_assessment_requests(requested_by_account_id,created_at);
CREATE INDEX ml_inputs_observation ON ml_assessment_observations(observation_id);
