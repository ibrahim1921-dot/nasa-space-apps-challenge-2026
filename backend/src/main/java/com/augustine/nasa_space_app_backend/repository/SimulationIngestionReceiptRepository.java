package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.SimulationIngestionReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Internal persistence access; authorization belongs in the future capture/ingestion service. */
public interface SimulationIngestionReceiptRepository extends JpaRepository<SimulationIngestionReceipt, UUID> {
    Optional<SimulationIngestionReceipt> findByCaptureIdAndSourceRecordId(UUID captureId, String sourceRecordId);
}
