-- Complete the intentional alert/assessment cycle only after both tables exist.
-- An existing successful assessment may generate an ML alert; an existing rule
-- alert may trigger a later assessment. No deferred FK or circular initial insert
-- is required. All historical references retain ON DELETE RESTRICT.

ALTER TABLE health_alerts ADD CONSTRAINT health_alerts_ml_assessment_fk
    FOREIGN KEY (ml_assessment_id, astronaut_id) REFERENCES ml_health_assessments(id, astronaut_id) ON DELETE RESTRICT;
