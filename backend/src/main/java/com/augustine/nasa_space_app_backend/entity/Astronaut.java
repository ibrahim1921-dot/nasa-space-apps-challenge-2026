package com.augustine.nasa_space_app_backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "astronauts")
public class Astronaut {

    @Id
    @Generated(event = EventType.INSERT)
    @Column(name = "id", nullable = false, insertable = false, updatable = false)
    private UUID id;

    @Column(name = "crew_code", nullable = false, unique = true, updatable = false,
            columnDefinition = "text")
    private String crewCode;

    @Column(name = "display_name", nullable = false, columnDefinition = "text")
    private String displayName;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false,
            columnDefinition = "timestamptz")
    private Instant createdAt;

    @Column(name = "archived_at", columnDefinition = "timestamptz")
    private Instant archivedAt;

    protected Astronaut() {
    }

    public Astronaut(String crewCode, String displayName) {
        this.crewCode = crewCode;
        this.displayName = displayName;
    }

    public UUID getId() {
        return id;
    }

    public String getCrewCode() {
        return crewCode;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(Instant archivedAt) {
        this.archivedAt = archivedAt;
    }
}
