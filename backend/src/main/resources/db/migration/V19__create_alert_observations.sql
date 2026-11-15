-- Evidence may reference scalar or structured observations. Composite FKs
-- enforce astronaut ownership. V27 restricts attachment to OPEN alerts and checks
-- rule scope/context/metric compatibility. V24 prevents removal/reassignment.

CREATE TABLE alert_observations (
    alert_id UUID NOT NULL,
    observation_id UUID NOT NULL,
    astronaut_id UUID NOT NULL,
    PRIMARY KEY (alert_id, observation_id),
    FOREIGN KEY (alert_id, astronaut_id) REFERENCES health_alerts(id, astronaut_id) ON DELETE RESTRICT,
    FOREIGN KEY (observation_id, astronaut_id) REFERENCES health_observations(id, astronaut_id) ON DELETE RESTRICT
);

CREATE INDEX alert_observations_observation_idx ON alert_observations (observation_id);
