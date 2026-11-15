-- Supported subject activity contexts, independent of measurement frequency.
-- UNKNOWN means unavailable context, not a wildcard.

CREATE TABLE indicator_contexts (
    indicator_code TEXT NOT NULL REFERENCES health_indicators(code) ON DELETE RESTRICT,
    activity_context TEXT NOT NULL CHECK (activity_context IN
        ('RESTING', 'SLEEPING', 'EXERCISING', 'OTHER', 'UNKNOWN')),
    PRIMARY KEY (indicator_code, activity_context)
);
