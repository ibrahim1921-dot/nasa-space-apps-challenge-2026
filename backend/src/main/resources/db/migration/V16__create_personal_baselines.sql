-- Personal reference values, distinct from clinical thresholds. ORIGINAL and
-- ROLLING series coexist. Effective periods use half-open [from, to) semantics.
-- V26 preserves values and permits one-time closure of an open validity period.
-- Correct an original by appending the next linked version, retaining version 1.
-- Services close/append atomically, serialize writes and reject period overlaps.

CREATE TABLE personal_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    indicator_code TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    unit TEXT NOT NULL,
    activity_context TEXT NOT NULL,
    comparison_scope_id UUID NOT NULL,
    baseline_kind TEXT NOT NULL CHECK (baseline_kind IN ('ORIGINAL', 'ROLLING')),
    version INTEGER NOT NULL CHECK (version > 0),
    reference_value NUMERIC(18,6) NOT NULL CHECK (reference_value > '-Infinity'::numeric AND reference_value < 'Infinity'::numeric),
    lower_bound NUMERIC(18,6) CHECK (lower_bound > '-Infinity'::numeric AND lower_bound < 'Infinity'::numeric),
    upper_bound NUMERIC(18,6) CHECK (upper_bound > '-Infinity'::numeric AND upper_bound < 'Infinity'::numeric),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    input_from TIMESTAMPTZ NOT NULL,
    input_to TIMESTAMPTZ NOT NULL,
    sample_count INTEGER NOT NULL CHECK (sample_count > 0),
    method TEXT NOT NULL CHECK (btrim(method) <> ''),
    source_name TEXT NOT NULL CHECK (btrim(source_name) <> ''),
    provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    supersedes_baseline_id UUID UNIQUE,
    correction_reason TEXT CHECK (btrim(correction_reason) <> ''),
    FOREIGN KEY (indicator_code, metric_code, unit) REFERENCES indicator_metrics(indicator_code, metric_code, unit) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, activity_context) REFERENCES indicator_contexts ON DELETE RESTRICT,
    FOREIGN KEY (comparison_scope_id, indicator_code) REFERENCES measurement_comparison_scopes(id, indicator_code) ON DELETE RESTRICT,
    UNIQUE (id, astronaut_id),
    FOREIGN KEY (supersedes_baseline_id, astronaut_id) REFERENCES personal_baselines(id, astronaut_id) ON DELETE RESTRICT,
    UNIQUE (astronaut_id, indicator_code, metric_code, activity_context, comparison_scope_id, baseline_kind, version),
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    CHECK (input_to >= input_from),
    CHECK (input_to <= effective_from),
    CHECK (lower_bound IS NULL OR lower_bound <= reference_value),
    CHECK (upper_bound IS NULL OR upper_bound >= reference_value),
    CHECK ((supersedes_baseline_id IS NOT NULL) = (correction_reason IS NOT NULL)),
    CHECK (supersedes_baseline_id IS NULL OR supersedes_baseline_id <> id),
    CHECK (baseline_kind <> 'ORIGINAL' OR version = 1 OR supersedes_baseline_id IS NOT NULL),
    CHECK (isfinite(effective_from) AND (effective_to IS NULL OR isfinite(effective_to))
        AND isfinite(input_from) AND isfinite(input_to))
);

CREATE INDEX personal_baselines_lookup_idx ON personal_baselines
    (astronaut_id, indicator_code, metric_code, activity_context, effective_from DESC);

CREATE INDEX personal_baselines_scope_idx ON personal_baselines (comparison_scope_id);
