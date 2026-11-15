package com.augustine.nasa_space_app_backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.Instant;
import java.util.UUID;

/** Inactive legacy V30 mapping. No activation workflow is enabled. Never expose its digest in APIs/logs. */
@Entity
@Table(name = "astronaut_activations")
public class AstronautActivation {

    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "astronaut_id", nullable = false, updatable = false)
    private UUID astronautId;

    @Column(name = "login_name", nullable = false, updatable = false, columnDefinition = "text")
    private String loginName;

    @Column(name = "credential_hash", nullable = false, unique = true, updatable = false,
            columnDefinition = "text")
    private String credentialHash;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false,
            columnDefinition = "timestamptz")
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant expiresAt;

    @Column(name = "consumed_at", columnDefinition = "timestamptz")
    private Instant consumedAt;

    @Column(name = "revoked_at", columnDefinition = "timestamptz")
    private Instant revokedAt;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "issued_by_account_id", updatable = false)
    private UUID issuedByAccountId;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected AstronautActivation() {
    }

    /** credentialHash is the hex SHA-256 digest of a random secret, never a raw credential. */
    public AstronautActivation(UUID astronautId, String loginName, String credentialHash,
                               Instant expiresAt, UUID issuedByAccountId) {
        this.astronautId = astronautId;
        this.loginName = loginName;
        this.credentialHash = credentialHash;
        this.expiresAt = expiresAt;
        this.issuedByAccountId = issuedByAccountId;
    }

    public UUID getId() { return id; }
    public UUID getAstronautId() { return astronautId; }
    public String getLoginName() { return loginName; }
    public String getCredentialHash() { return credentialHash; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getConsumedAt() { return consumedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public int getFailedAttempts() { return failedAttempts; }
    public UUID getIssuedByAccountId() { return issuedByAccountId; }
    public Long getVersion() { return version; }

    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public void setFailedAttempts(int failedAttempts) { this.failedAttempts = failedAttempts; }
}
