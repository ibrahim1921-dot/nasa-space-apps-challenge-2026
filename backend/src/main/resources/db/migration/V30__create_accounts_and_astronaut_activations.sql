-- Authentication identities are separate from permanent astronaut profiles.
-- No users, passwords, or activation credentials are seeded by this migration.
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login_name TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    astronaut_id UUID UNIQUE REFERENCES astronauts(id) ON DELETE RESTRICT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT accounts_login_name_format CHECK (
        login_name ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    ),
    -- BCrypt only. Raw passwords and other hash formats are not accepted.
    CONSTRAINT accounts_password_hash_format CHECK (
        password_hash ~ '^[$]2[aby][$](0[4-9]|[12][0-9]|3[01])[$][./A-Za-z0-9]{53}$'
    ),
    CONSTRAINT accounts_role_profile CHECK (
        (role = 'ASTRONAUT' AND astronaut_id IS NOT NULL)
        OR (role = 'NASA_OFFICER' AND astronaut_id IS NULL)
    ),
    CONSTRAINT accounts_created_at_finite CHECK (isfinite(created_at)),
    CONSTRAINT accounts_version_nonnegative CHECK (version >= 0)
);

CREATE TABLE astronaut_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astronaut_id UUID NOT NULL REFERENCES astronauts(id) ON DELETE RESTRICT,
    login_name TEXT NOT NULL,
    -- Lowercase hex SHA-256 of a high-entropy random secret, never the secret itself.
    credential_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    -- NULL is reserved for explicit, trusted operator provisioning (no HTTP route).
    issued_by_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT activations_login_name_format CHECK (
        login_name ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    ),
    CONSTRAINT activations_credential_hash_format CHECK (
        credential_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT activations_expiry CHECK (
        isfinite(created_at) AND isfinite(expires_at) AND expires_at > created_at
    ),
    CONSTRAINT activations_consumption CHECK (
        consumed_at IS NULL OR
        (isfinite(consumed_at) AND consumed_at >= created_at AND consumed_at < expires_at)
    ),
    CONSTRAINT activations_revocation CHECK (
        revoked_at IS NULL OR (isfinite(revoked_at) AND revoked_at >= created_at)
    ),
    CONSTRAINT activations_terminal_state CHECK (consumed_at IS NULL OR revoked_at IS NULL),
    CONSTRAINT activations_consumption_attempts CHECK (consumed_at IS NULL OR failed_attempts < 5),
    CONSTRAINT activations_attempt_limit CHECK (failed_attempts BETWEEN 0 AND 5),
    CONSTRAINT activations_version_nonnegative CHECK (version >= 0)
);

-- Expired/exhausted invitations must be explicitly revoked before replacement.
-- Time-dependent predicates cannot be used in PostgreSQL partial indexes.
CREATE UNIQUE INDEX astronaut_activations_pending_profile_idx
    ON astronaut_activations (astronaut_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX astronaut_activations_pending_login_idx
    ON astronaut_activations (login_name)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX astronaut_activations_issuer_idx ON astronaut_activations (issued_by_account_id);

-- A terminal invitation cannot be reopened, even by a stale update. Failed
-- attempts may not be reset to bypass the limit; issue a new invitation instead.
CREATE FUNCTION preserve_astronaut_activation_state() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
        OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
        OR NEW.failed_attempts < OLD.failed_attempts THEN
        RAISE EXCEPTION 'Activation terminal state and attempt history cannot be reset'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER astronaut_activations_preserve_state BEFORE UPDATE ON astronaut_activations
    FOR EACH ROW EXECUTE FUNCTION preserve_astronaut_activation_state();
