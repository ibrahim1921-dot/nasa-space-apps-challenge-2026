package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.AstronautActivation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

/** Inactive legacy V30 repository, retained for schema/mapping compatibility only. */
public interface AstronautActivationRepository extends JpaRepository<AstronautActivation, UUID> {

    /** Call inside a write transaction; the lock serializes redemption of this invitation. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AstronautActivation> findLockedById(UUID id);

    /** Includes expired/exhausted invitations: the service must revoke these before replacement. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AstronautActivation> findByAstronautIdAndConsumedAtIsNullAndRevokedAtIsNull(UUID astronautId);
}
