package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.dto.AstronautProfileResponse;
import com.augustine.nasa_space_app_backend.dto.CrewProfileResponse;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AstronautService {
    private final AstronautRepository astronauts;
    private final AuthService auth;
    private final Clock clock;

    public AstronautService(AstronautRepository astronauts, AuthService auth, Clock clock) {
        this.astronauts = astronauts;
        this.auth = auth;
        this.clock = clock;
    }

    public List<CrewProfileResponse> getAllActiveAstronauts() {
        currentAccount();
        return astronauts.findAllByArchivedAtIsNull().stream()
                .sorted(Comparator.comparing(Astronaut::getCrewCode))
                .map(profile -> new CrewProfileResponse(profile.getId(), profile.getCrewCode(), profile.getDisplayName()))
                .toList();
    }

    public AstronautProfileResponse getAstronautById(UUID id) {
        AccountIdentity caller = currentAccount();
        if (caller.role() != AccountRole.NASA_OFFICER && !caller.profile().astronautId().equals(id)) {
            throw new AccessDeniedException("Only your own astronaut profile is accessible.");
        }
        requireId(id);
        return response(astronauts.findById(id).orElseThrow(AstronautNotFoundException::new));
    }

    public AstronautProfileResponse getAstronautByCrewCode(String crewCode) {
        AccountIdentity caller = currentAccount();
        if (caller.role() != AccountRole.NASA_OFFICER && !caller.profile().crewCode().equals(crewCode)) {
            throw new AccessDeniedException("Only your own astronaut profile is accessible.");
        }
        if (crewCode == null || crewCode.isBlank()) throw new IllegalArgumentException("Crew code is required.");
        return response(astronauts.findByCrewCode(crewCode).orElseThrow(AstronautNotFoundException::new));
    }

    public AstronautProfileResponse getMyProfile() {
        AccountIdentity caller = currentAccount();
        if (caller.role() != AccountRole.ASTRONAUT) throw new AccessDeniedException("An astronaut account is required.");
        return response(astronauts.findById(caller.profile().astronautId()).orElseThrow(AstronautNotFoundException::new));
    }

    @Transactional
    public AstronautProfileResponse archiveAstronaut(UUID id) {
        requireOfficer();
        requireId(id);
        Astronaut profile = astronauts.findLockedById(id).orElseThrow(AstronautNotFoundException::new);
        if (profile.getArchivedAt() == null) {
            // Match PostgreSQL microsecond precision so first/repeated responses keep the same timestamp.
            profile.setArchivedAt(clock.instant().truncatedTo(ChronoUnit.MICROS));
        }
        return response(profile);
    }

    @Transactional
    public AstronautProfileResponse reactivateAstronaut(UUID id) {
        requireOfficer();
        requireId(id);
        Astronaut profile = astronauts.findLockedById(id).orElseThrow(AstronautNotFoundException::new);
        if (profile.getArchivedAt() != null) profile.setArchivedAt(null);
        return response(profile);
    }

    private void requireOfficer() {
        if (currentAccount().role() != AccountRole.NASA_OFFICER) {
            throw new AccessDeniedException("NASA officer access is required.");
        }
    }

    private AccountIdentity currentAccount() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) {
            throw new AuthenticationCredentialsNotFoundException("Authentication is required.");
        }
        // Reload enabled/archive status and role even for direct service calls, without the HTTP filter.
        // Only the server's session principal supplies the account UUID; authorities alone are insufficient.
        return auth.currentIdentity(principal.accountId());
    }

    private static void requireId(UUID id) {
        if (id == null) throw new IllegalArgumentException("Astronaut UUID is required.");
    }

    private static AstronautProfileResponse response(Astronaut profile) {
        return new AstronautProfileResponse(profile.getId(), profile.getCrewCode(), profile.getDisplayName(),
                profile.getCreatedAt(), profile.getArchivedAt());
    }
}
