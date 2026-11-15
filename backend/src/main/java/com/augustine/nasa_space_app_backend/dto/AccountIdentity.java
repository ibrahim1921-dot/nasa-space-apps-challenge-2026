package com.augustine.nasa_space_app_backend.dto;

import com.augustine.nasa_space_app_backend.entity.AccountRole;
import java.util.UUID;

public record AccountIdentity(UUID accountId, String loginName, AccountRole role, Profile profile) {
    public record Profile(UUID astronautId, String crewCode, String displayName) { }
}
