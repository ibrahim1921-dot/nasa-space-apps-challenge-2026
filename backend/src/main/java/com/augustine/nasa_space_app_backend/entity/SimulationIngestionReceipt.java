package com.augustine.nasa_space_app_backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.Instant;
import java.util.UUID;

/** Persistence only; UUID foreign keys avoid loading or exposing account/medical entity graphs. */
@Entity
@Table(name = "simulation_ingestion_receipts")
public class SimulationIngestionReceipt {
    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "capture_id", nullable = false, updatable = false)
    private UUID captureId;

    @Column(name = "profile_mapping_id", nullable = false, updatable = false)
    private UUID profileMappingId;

    @Column(name = "astronaut_id", nullable = false, updatable = false)
    private UUID astronautId;

    @Column(name = "source_record_id", nullable = false, updatable = false, columnDefinition = "text")
    private String sourceRecordId;

    @Column(name = "export_sequence", nullable = false, updatable = false)
    private long exportSequence;

    @Column(name = "payload_sha256", nullable = false, updatable = false, columnDefinition = "text")
    private String payloadSha256;

    @Column(name = "canonicalization_version", nullable = false, updatable = false, columnDefinition = "text")
    private String canonicalizationVersion;

    @Column(name = "observation_id", nullable = false, updatable = false)
    private UUID observationId;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;


    protected SimulationIngestionReceipt() { }

    public SimulationIngestionReceipt(UUID captureId, UUID profileMappingId, UUID astronautId, String sourceRecordId, long exportSequence, String payloadSha256, String canonicalizationVersion, UUID observationId) {
        this.captureId = captureId;
        this.profileMappingId = profileMappingId;
        this.astronautId = astronautId;
        this.sourceRecordId = sourceRecordId;
        this.exportSequence = exportSequence;
        this.payloadSha256 = payloadSha256;
        this.canonicalizationVersion = canonicalizationVersion;
        this.observationId = observationId;

    }

    public UUID getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCaptureId() { return captureId; }
    public UUID getProfileMappingId() { return profileMappingId; }
    public UUID getAstronautId() { return astronautId; }
    public String getSourceRecordId() { return sourceRecordId; }
    public long getExportSequence() { return exportSequence; }
    public String getPayloadSha256() { return payloadSha256; }
    public String getCanonicalizationVersion() { return canonicalizationVersion; }
    public UUID getObservationId() { return observationId; }
}
