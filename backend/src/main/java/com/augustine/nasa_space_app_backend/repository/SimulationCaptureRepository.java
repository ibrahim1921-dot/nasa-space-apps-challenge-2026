package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.SimulationCapture;
import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Internal persistence access; authorization belongs in the capture/ingestion service. */
public interface SimulationCaptureRepository extends JpaRepository<SimulationCapture, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SimulationCapture> findLockedById(UUID id);

    List<SimulationCapture> findAllByWorkspaceIdAndEngineRunId(UUID workspaceId, UUID engineRunId);

    @Query(value = "SELECT * FROM simulation_captures "
            + "WHERE created_by_account_id = :creator AND manifest->>'registration_key' = :key", nativeQuery = true)
    Optional<SimulationCapture> findRegistration(UUID creator, String key);
}
