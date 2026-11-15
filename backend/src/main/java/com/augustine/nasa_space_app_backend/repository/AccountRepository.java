package com.augustine.nasa_space_app_backend.repository;

import com.augustine.nasa_space_app_backend.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Account> findLockedById(UUID id);

    Optional<Account> findByLoginName(String loginName);

    boolean existsByLoginName(String loginName);

    Optional<Account> findByAstronautId(UUID astronautId);

    boolean existsByAstronautId(UUID astronautId);
}
