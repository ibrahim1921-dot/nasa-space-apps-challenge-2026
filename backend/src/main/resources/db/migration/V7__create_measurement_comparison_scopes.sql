-- Typed, stable comparison scopes shared by observations, baselines and rules.
-- Site/protocol/scale/origin metadata is stored only here, not in value tables.
-- Reuse registered UUIDs; protocol aliases and duplicate semantic definitions
-- require service governance. Register replacements instead of editing a scope.

CREATE TABLE measurement_comparison_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_code TEXT NOT NULL CHECK (btrim(scope_code) <> ''),
    indicator_code TEXT NOT NULL,
    storage_kind TEXT NOT NULL,
    body_site TEXT CHECK (btrim(body_site) <> ''),
    protocol_code TEXT CHECK (btrim(protocol_code) <> ''),
    protocol_version TEXT CHECK (btrim(protocol_version) <> ''),
    scale_name TEXT CHECK (btrim(scale_name) <> ''),
    scale_version TEXT CHECK (btrim(scale_version) <> ''),
    scale_min NUMERIC(12,4),
    scale_max NUMERIC(12,4),
    radiation_astronaut_id UUID REFERENCES astronauts(id) ON DELETE RESTRICT,
    accumulation_started_at TIMESTAMPTZ CHECK (isfinite(accumulation_started_at)),
    dosimetry_method TEXT CHECK (btrim(dosimetry_method) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (indicator_code, storage_kind) REFERENCES health_indicators(code, storage_kind) ON DELETE RESTRICT,
    UNIQUE (indicator_code, scope_code),
    UNIQUE (id, indicator_code),
    CHECK ((storage_kind IN ('MUSCLE', 'BONE') OR indicator_code = 'cumulative_absorbed_radiation_dose') = (body_site IS NOT NULL)),
    CHECK ((storage_kind IN ('MUSCLE', 'BONE')) = (protocol_code IS NOT NULL)),
    CHECK ((storage_kind IN ('MUSCLE', 'BONE')) = (protocol_version IS NOT NULL)),
    CHECK ((storage_kind = 'MOOD') = (scale_name IS NOT NULL)),
    CHECK ((storage_kind = 'MOOD') = (scale_version IS NOT NULL)),
    CHECK ((storage_kind = 'MOOD') = (scale_min IS NOT NULL)),
    CHECK ((storage_kind = 'MOOD') = (scale_max IS NOT NULL)),
    CHECK (scale_min IS NULL OR (scale_min > '-Infinity'::numeric
        AND scale_max < 'Infinity'::numeric AND scale_max > scale_min)),
    CHECK ((indicator_code = 'cumulative_absorbed_radiation_dose') = (radiation_astronaut_id IS NOT NULL)),
    CHECK ((indicator_code = 'cumulative_absorbed_radiation_dose') = (accumulation_started_at IS NOT NULL)),
    CHECK ((indicator_code = 'cumulative_absorbed_radiation_dose') = (dosimetry_method IS NOT NULL))
);

CREATE INDEX measurement_scopes_radiation_astronaut_idx ON measurement_comparison_scopes (radiation_astronaut_id);
