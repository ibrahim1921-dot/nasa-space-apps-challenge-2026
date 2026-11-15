package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.Account;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.entity.AstronautActivation;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.repository.AstronautActivationRepository;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class AccountPersistenceTests extends PostgreSqlIntegrationTest {

    // Syntactically valid, inert test data: not a provisioned account or a usable demo password.
    private static final String TEST_HASH = "$2a$12$" + "a".repeat(53);

    @Autowired private AccountRepository accounts;
    @Autowired private AstronautRepository astronauts;
    @Autowired private AstronautActivationRepository activations;
    @Autowired private EntityManager entityManager;

    @Test
    void astronautAccountRoundTripsWithDatabaseDefaultsAndStableIdentity() {
        Astronaut astronaut = astronauts.saveAndFlush(new Astronaut("persistence-01", "Test Astronaut"));
        Account account = accounts.saveAndFlush(new Account(
                "test.astronaut", TEST_HASH, AccountRole.ASTRONAUT, astronaut.getId()));

        assertThat(account.getId()).isNotNull();
        assertThat(account.getCreatedAt()).isNotNull();
        assertThat(account.getVersion()).isZero();
        entityManager.clear();

        Account loaded = accounts.findByLoginName("test.astronaut").orElseThrow();
        assertThat(loaded.getRole()).isEqualTo(AccountRole.ASTRONAUT);
        assertThat(loaded.getAstronautId()).isEqualTo(astronaut.getId());
        assertThat(loaded.isEnabled()).isTrue();
        assertThat(accounts.existsByLoginName("test.astronaut")).isTrue();
        assertThat(accounts.existsByAstronautId(astronaut.getId())).isTrue();
        assertThat(accounts.findByAstronautId(astronaut.getId())).isPresent();
        assertThat(accounts.findByLoginName("missing")).isEmpty();

        loaded.setEnabled(false);
        accounts.flush();
        entityManager.clear();
        Account updated = accounts.findById(account.getId()).orElseThrow();
        assertThat(updated.isEnabled()).isFalse();
        assertThat(updated.getVersion()).isEqualTo(1L);
        assertThat(updated.getCreatedAt()).isEqualTo(account.getCreatedAt());
        assertThat(updated.getAstronautId()).isEqualTo(astronaut.getId());
    }

    @Test
    void officerAccountHasNoAstronautProfile() {
        Account officer = accounts.saveAndFlush(new Account(
                "test.officer", TEST_HASH, AccountRole.NASA_OFFICER, null));
        entityManager.clear();

        Account loaded = accounts.findById(officer.getId()).orElseThrow();
        assertThat(loaded.getRole()).isEqualTo(AccountRole.NASA_OFFICER);
        assertThat(loaded.getAstronautId()).isNull();
    }

    @Test
    void activationRoundTripsAndCanBeLockedAndConsumed() {
        Astronaut astronaut = astronauts.saveAndFlush(new Astronaut("persistence-02", "Invited Astronaut"));
        Account officer = accounts.saveAndFlush(new Account(
                "inviting.officer", TEST_HASH, AccountRole.NASA_OFFICER, null));
        Instant expiry = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        AstronautActivation invitation = activations.saveAndFlush(new AstronautActivation(
                astronaut.getId(), "invited.astronaut", "a".repeat(64), expiry, officer.getId()));
        assertThat(invitation.getId()).isNotNull();
        assertThat(invitation.getCreatedAt()).isNotNull();
        entityManager.clear();

        AstronautActivation loaded = activations.findLockedById(invitation.getId()).orElseThrow();
        assertThat(loaded.getAstronautId()).isEqualTo(astronaut.getId());
        assertThat(loaded.getIssuedByAccountId()).isEqualTo(officer.getId());
        assertThat(loaded.getLoginName()).isEqualTo("invited.astronaut");
        assertThat(loaded.getExpiresAt()).isEqualTo(expiry);
        assertThat(loaded.getFailedAttempts()).isZero();
        assertThat(loaded.getConsumedAt()).isNull();
        assertThat(loaded.getRevokedAt()).isNull();
        assertThat(activations.findByAstronautIdAndConsumedAtIsNullAndRevokedAtIsNull(astronaut.getId()))
                .isPresent();

        loaded.setFailedAttempts(1);
        loaded.setConsumedAt(Instant.now());
        activations.flush();
        entityManager.clear();
        AstronautActivation consumed = activations.findById(invitation.getId()).orElseThrow();
        assertThat(consumed.getConsumedAt()).isNotNull();
        assertThat(consumed.getFailedAttempts()).isEqualTo(1);
        assertThat(consumed.getVersion()).isEqualTo(1L);
        assertThat(activations.findByAstronautIdAndConsumedAtIsNullAndRevokedAtIsNull(astronaut.getId()))
                .isEmpty();
    }
}
