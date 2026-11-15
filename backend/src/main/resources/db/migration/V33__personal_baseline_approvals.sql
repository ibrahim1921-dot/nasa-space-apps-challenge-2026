-- Explicit proposals and officer approvals. No baseline values or limits are seeded.
-- Existing baseline rows remain historical and are not implicitly approved.
CREATE TABLE personal_baseline_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request JSONB NOT NULL CHECK (jsonb_typeof(request) = 'object'),
    UNIQUE (id, astronaut_id)
);
CREATE TABLE personal_baseline_approvals (
    proposal_id UUID PRIMARY KEY REFERENCES personal_baseline_proposals(id) ON DELETE RESTRICT,
    baseline_id UUID NOT NULL UNIQUE REFERENCES personal_baselines(id) ON DELETE RESTRICT,
    approved_by UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approval_note TEXT NOT NULL CHECK (btrim(approval_note) <> '')
);
CREATE INDEX personal_baseline_proposals_history ON personal_baseline_proposals(astronaut_id, created_at, id);
DO $$
DECLARE tab TEXT;
BEGIN
    FOREACH tab IN ARRAY ARRAY['personal_baseline_proposals','personal_baseline_approvals'] LOOP
        EXECUTE format('CREATE TRIGGER retain_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_historical_mutation()',tab);
        EXECUTE format('CREATE TRIGGER retain_history_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_historical_mutation()',tab);
    END LOOP;
END;
$$;

-- Serialize series writes and defend against overlapping intervals, including SQL writers.
CREATE FUNCTION guard_personal_baseline_series() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM astronauts WHERE id = NEW.astronaut_id FOR UPDATE;
    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM personal_baselines b WHERE
        ROW(b.astronaut_id,b.indicator_code,b.metric_code,b.activity_context,b.comparison_scope_id,b.baseline_kind)
        = ROW(NEW.astronaut_id,NEW.indicator_code,NEW.metric_code,NEW.activity_context,NEW.comparison_scope_id,NEW.baseline_kind)
        AND tstzrange(b.effective_from,b.effective_to,'[)') && tstzrange(NEW.effective_from,NEW.effective_to,'[)')
    ) THEN
        RAISE EXCEPTION 'Conflicting personal baseline period' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER personal_baselines_series BEFORE INSERT ON personal_baselines
    FOR EACH ROW EXECUTE FUNCTION guard_personal_baseline_series();

CREATE FUNCTION validate_personal_baseline_approval() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE p personal_baseline_proposals%ROWTYPE; b personal_baselines%ROWTYPE;
BEGIN
    SELECT * INTO STRICT p FROM personal_baseline_proposals WHERE id = NEW.proposal_id;
    SELECT * INTO STRICT b FROM personal_baselines WHERE id = NEW.baseline_id;
    IF b.astronaut_id <> p.astronaut_id OR NEW.approved_by = p.created_by OR NOT EXISTS (
        SELECT 1 FROM accounts WHERE id = NEW.approved_by AND role = 'NASA_OFFICER' AND enabled
    ) OR b.provenance ->> 'proposal_id' IS DISTINCT FROM p.id::text THEN
        RAISE EXCEPTION 'Independent enabled officer approval with matching proposal required' USING ERRCODE = '23514';
    END IF;
    IF ROW(b.indicator_code,b.metric_code,b.unit,b.activity_context,b.comparison_scope_id,b.baseline_kind,
        b.reference_value,b.effective_from,b.effective_to,b.input_from,b.input_to,b.method,b.source_name,
        b.supersedes_baseline_id,b.correction_reason,b.sample_count)
        IS DISTINCT FROM ROW(p.request->>'indicatorCode',p.request->>'metricCode',p.request->>'unit',
        p.request->>'activityContext',(p.request->>'comparisonScopeId')::uuid,p.request->>'baselineKind',
        (p.request->>'referenceValue')::numeric,(p.request->>'effectiveFrom')::timestamptz,
        (p.request->>'effectiveTo')::timestamptz,(p.request->>'inputFrom')::timestamptz,
        (p.request->>'inputTo')::timestamptz,p.request->>'method',p.request->>'sourceName',
        (p.request->>'supersedesBaselineId')::uuid,p.request->>'correctionReason',jsonb_array_length(p.request->'observationIds'))
        OR b.lower_bound IS NOT NULL OR b.upper_bound IS NOT NULL
        OR b.provenance->>'source_type' IS DISTINCT FROM 'REAL_OBSERVATIONS'
        OR b.provenance->'observation_ids' IS DISTINCT FROM p.request->'observationIds' THEN
        RAISE EXCEPTION 'Approved baseline must match the immutable proposal' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM measurement_comparison_scopes s WHERE s.id=b.comparison_scope_id
        AND (to_jsonb(s)::text ~* '(simulation|synthetic)' OR EXISTS (
            SELECT 1 FROM simulation_scope_provisioning_audit a WHERE a.scope_id=s.id)))
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.request->'observationIds') evidence(id)
            LEFT JOIN health_observations o ON o.id=evidence.id::uuid
            WHERE o.id IS NULL OR o.source_kind='SIMULATION' OR o.simulation_metadata IS NOT NULL
                OR (o.provenance::text || o.source_name) ~* '(simulation|synthetic)'
                OR ROW(o.astronaut_id,o.indicator_code,o.comparison_scope_id,o.activity_context)
                    IS DISTINCT FROM ROW(b.astronaut_id,b.indicator_code,b.comparison_scope_id,b.activity_context)
                OR o.measured_at NOT BETWEEN b.input_from AND b.input_to) THEN
        RAISE EXCEPTION 'Synthetic or mismatched evidence cannot support a personal baseline' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER personal_baseline_approval_validate BEFORE INSERT ON personal_baseline_approvals
    FOR EACH ROW EXECUTE FUNCTION validate_personal_baseline_approval();

CREATE FUNCTION validate_personal_baseline_proposer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM accounts WHERE id=NEW.created_by AND role='NASA_OFFICER' AND enabled FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Enabled officer proposal required' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER personal_baseline_proposer_validate BEFORE INSERT ON personal_baseline_proposals
    FOR EACH ROW EXECUTE FUNCTION validate_personal_baseline_proposer();
