-- Versioned, configured bounds; no medical limits are seeded. A value outside
-- the supplied inclusive bounds triggers service evaluation. NULL astronaut_id
-- is a general rule. UNKNOWN activity is not a wildcard. Services define rule
-- precedence and validity-period selection; V26 protects published contents.

CREATE TABLE monitoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code TEXT NOT NULL CHECK (btrim(rule_code) <> ''),
    version INTEGER NOT NULL CHECK (version > 0),
    astronaut_id UUID REFERENCES astronauts(id) ON DELETE RESTRICT,
    indicator_code TEXT NOT NULL,
    metric_code TEXT NOT NULL,
    unit TEXT NOT NULL,
    activity_context TEXT NOT NULL,
    comparison_scope_id UUID NOT NULL,
    lower_bound NUMERIC(18,6) CHECK (lower_bound > '-Infinity'::numeric AND lower_bound < 'Infinity'::numeric),
    upper_bound NUMERIC(18,6) CHECK (upper_bound > '-Infinity'::numeric AND upper_bound < 'Infinity'::numeric),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    source_name TEXT NOT NULL CHECK (btrim(source_name) <> ''),
    rationale TEXT NOT NULL CHECK (btrim(rationale) <> ''),
    provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rule_code, version),
    FOREIGN KEY (indicator_code, metric_code, unit) REFERENCES indicator_metrics(indicator_code, metric_code, unit) ON DELETE RESTRICT,
    FOREIGN KEY (indicator_code, activity_context) REFERENCES indicator_contexts ON DELETE RESTRICT,
    FOREIGN KEY (comparison_scope_id, indicator_code) REFERENCES measurement_comparison_scopes(id, indicator_code) ON DELETE RESTRICT,
    CHECK (lower_bound IS NOT NULL OR upper_bound IS NOT NULL),
    CHECK (lower_bound IS NULL OR upper_bound IS NULL OR lower_bound <= upper_bound),
    CHECK (valid_to IS NULL OR valid_to > valid_from),
    CHECK (isfinite(valid_from) AND (valid_to IS NULL OR isfinite(valid_to)))
);

CREATE INDEX monitoring_rules_lookup_idx ON monitoring_rules
    (indicator_code, metric_code, activity_context, astronaut_id, valid_from DESC);

CREATE INDEX monitoring_rules_astronaut_idx ON monitoring_rules (astronaut_id);

CREATE INDEX monitoring_rules_scope_idx ON monitoring_rules (comparison_scope_id);
