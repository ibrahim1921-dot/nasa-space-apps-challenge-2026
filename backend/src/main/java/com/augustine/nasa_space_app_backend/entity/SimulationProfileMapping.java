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
@Table(name = "simulation_profile_mappings")
public class SimulationProfileMapping {
    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "capture_id", nullable = false, updatable = false)
    private UUID captureId;

    @Column(name = "simulation_astronaut_id", nullable = false, updatable = false)
    private UUID simulationAstronautId;

    @Column(name = "simulation_crew_code", nullable = false, updatable = false, columnDefinition = "text")
    private String simulationCrewCode;

    @Column(name = "astronaut_id", nullable = false, updatable = false)
    private UUID astronautId;

    @Column(name = "target_crew_code", nullable = false, updatable = false, columnDefinition = "text")
    private String targetCrewCode;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false, columnDefinition = "timestamptz")
    private Instant createdAt;


    protected SimulationProfileMapping() { }

    public SimulationProfileMapping(UUID captureId, UUID simulationAstronautId, String simulationCrewCode, UUID astronautId, String targetCrewCode) {
        this.captureId = captureId;
        this.simulationAstronautId = simulationAstronautId;
        this.simulationCrewCode = simulationCrewCode;
        this.astronautId = astronautId;
        this.targetCrewCode = targetCrewCode;

    }

    public UUID getId() { return id; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getCaptureId() { return captureId; }
    public UUID getSimulationAstronautId() { return simulationAstronautId; }
    public String getSimulationCrewCode() { return simulationCrewCode; }
    public UUID getAstronautId() { return astronautId; }
    public String getTargetCrewCode() { return targetCrewCode; }
}
