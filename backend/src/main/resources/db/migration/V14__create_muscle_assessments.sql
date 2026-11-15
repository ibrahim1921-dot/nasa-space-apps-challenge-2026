-- Muscle site/protocol/version live in the scope. Grip force uses kgf; muscle
-- mass uses kg. Ingestion must identify the actual instrument quantity/unit.

CREATE TABLE muscle_assessments (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL DEFAULT 'muscle' CHECK (indicator_code = 'muscle'),
    storage_kind TEXT NOT NULL DEFAULT 'MUSCLE' CHECK (storage_kind = 'MUSCLE'),
    grip_strength_kgf NUMERIC(12,4) CHECK (grip_strength_kgf >= 0 AND grip_strength_kgf < 'Infinity'::numeric),
    muscle_mass_kg NUMERIC(12,4) CHECK (muscle_mass_kg > 0 AND muscle_mass_kg < 'Infinity'::numeric),
    CHECK (grip_strength_kgf IS NOT NULL OR muscle_mass_kg IS NOT NULL),
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT
);
