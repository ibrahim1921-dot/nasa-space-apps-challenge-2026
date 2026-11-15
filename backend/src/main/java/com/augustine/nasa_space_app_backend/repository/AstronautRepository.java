package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.Astronaut;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AstronautRepository extends JpaRepository<Astronaut, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Astronaut> findLockedById(UUID id);

    Optional<Astronaut> findByCrewCode(String crewCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Astronaut> findLockedByCrewCode(String crewCode);

    boolean existsByCrewCode(String crewCode);

    List<Astronaut> findAllByArchivedAtIsNull();
}
