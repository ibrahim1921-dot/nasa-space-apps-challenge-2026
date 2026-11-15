package com.augustine.nasa_space_app_backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.Instant;
import java.util.UUID;

/** Persistence model only: never expose accounts directly in API responses or logs. */
@Entity
@Table(name = "accounts")
public class Account {

    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "login_name", nullable = false, unique = true, updatable = false,
            columnDefinition = "text")
    private String loginName;

    @Column(name = "password_hash", nullable = false, columnDefinition = "text")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, updatable = false, columnDefinition = "text")
    private AccountRole role;

    // Scalar UUID maps the database FK without loading a profile or exposing a JPA graph.
    @Column(name = "astronaut_id", unique = true, updatable = false)
    private UUID astronautId;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false,
            columnDefinition = "timestamptz")
    private Instant createdAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected Account() {
    }

    /** passwordHash must already be BCrypt-encoded; astronautId is null only for officers. */
    public Account(String loginName, String passwordHash, AccountRole role, UUID astronautId) {
        this.loginName = loginName;
        this.passwordHash = passwordHash;
        this.role = role;
        this.astronautId = astronautId;
    }

    public UUID getId() { return id; }
    public String getLoginName() { return loginName; }
    public String getPasswordHash() { return passwordHash; }
    public AccountRole getRole() { return role; }
    public UUID getAstronautId() { return astronautId; }
    public boolean isEnabled() { return enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Long getVersion() { return version; }

    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
