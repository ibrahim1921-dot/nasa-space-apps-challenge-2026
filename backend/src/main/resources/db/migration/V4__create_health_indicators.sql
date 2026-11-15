-- Nine monitored indicators are seeded separately in V22. Storage kind controls
-- scalar versus compound/episodic representation, not sampling frequency.

CREATE TABLE health_indicators (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    storage_kind TEXT NOT NULL CHECK (storage_kind IN
        ('SCALAR', 'BLOOD_PRESSURE', 'SLEEP', 'MOOD', 'MUSCLE', 'BONE')),
    sampling_description TEXT NOT NULL,
    UNIQUE (code, storage_kind)
);
