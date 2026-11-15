package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.SimulationProfileMapping;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Internal persistence access; authorization belongs in the future capture/ingestion service. */
public interface SimulationProfileMappingRepository extends JpaRepository<SimulationProfileMapping, UUID> {
    List<SimulationProfileMapping> findAllByCaptureId(UUID captureId);

    Optional<SimulationProfileMapping> findByCaptureIdAndSimulationAstronautId(UUID captureId, UUID simulationAstronautId);
}
