package com.augustine.nasa_space_app_backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.util.Map;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.Instant;
import java.util.UUID;

/** Persistence only; UUID foreign keys avoid loading or exposing account/medical entity graphs. */
@Entity
@Table(name = "simulation_captures")
public class SimulationCapture {
    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "workspace_id", nullable = false, updatable = false)
    private UUID workspaceId;

    @Column(name = "engine_run_id", nullable = false, updatable = false)
    private UUID engineRunId;

    @Column(name = "created_by_account_id", nullable = false, updatable = false)
    private UUID createdByAccountId;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, columnDefinition = "text")
    private SimulationCaptureStatus status = SimulationCaptureStatus.DRAFT;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "manifest", nullable = false, updatable = false, columnDefinition = "jsonb")
    private Map<String, Object> manifest;

    @Column(name = "activated_at", columnDefinition = "timestamptz")
    private Instant activatedAt;

    @Column(name = "closed_at", columnDefinition = "timestamptz")
    private Instant closedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected SimulationCapture() { }

    public SimulationCapture(UUID workspaceId, UUID engineRunId, UUID createdByAccountId, Map<String, Object> manifest) {
        this.workspaceId = workspaceId;
        this.engineRunId = engineRunId;
        this.createdByAccountId = createdByAccountId;
        this.manifest = Map.copyOf(manifest);
    }

    public UUID getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getEngineRunId() { return engineRunId; }
    public UUID getCreatedByAccountId() { return createdByAccountId; }
    public SimulationCaptureStatus getStatus() { return status; }
    public Map<String, Object> getManifest() { return Map.copyOf(manifest); }
    public Instant getActivatedAt() { return activatedAt; }
    public Instant getClosedAt() { return closedAt; }
    public Long getVersion() { return version; }

    /** Call in a write transaction, after explicitly approved mappings have been flushed. */
    public void activate(Instant at) {
        if (status != SimulationCaptureStatus.DRAFT) throw new IllegalStateException("Capture must be DRAFT.");
        activatedAt = java.util.Objects.requireNonNull(at);
        status = SimulationCaptureStatus.ACTIVE;
    }

    public void close(Instant at) {
        if (status != SimulationCaptureStatus.ACTIVE) throw new IllegalStateException("Capture must be ACTIVE.");
        closedAt = java.util.Objects.requireNonNull(at);
        status = SimulationCaptureStatus.CLOSED;
    }
}
