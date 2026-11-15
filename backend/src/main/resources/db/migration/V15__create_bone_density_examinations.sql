-- Areal bone mineral density in g/cm2. Site and examination method/protocol
-- are owned by the comparison scope; examinations remain periodic observations.

CREATE TABLE bone_density_examinations (
    observation_id UUID PRIMARY KEY,
    indicator_code TEXT NOT NULL DEFAULT 'bone_mineral_density' CHECK (indicator_code = 'bone_mineral_density'),
    storage_kind TEXT NOT NULL DEFAULT 'BONE' CHECK (storage_kind = 'BONE'),
    areal_density NUMERIC(12,6) NOT NULL CHECK (areal_density > 0 AND areal_density < 'Infinity'::numeric),
    unit TEXT NOT NULL DEFAULT 'g/cm2' CHECK (unit = 'g/cm2'),
    FOREIGN KEY (observation_id, indicator_code, storage_kind) REFERENCES health_observations(id, indicator_code, storage_kind) ON DELETE RESTRICT
);
