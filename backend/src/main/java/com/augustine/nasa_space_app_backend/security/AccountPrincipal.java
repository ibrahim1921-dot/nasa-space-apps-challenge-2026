package com.augustine.nasa_space_app_backend.security;

import java.io.Serializable;
import java.security.Principal;
import java.util.UUID;

/** Session identity contains no credentials, hashes, profile data, or client-selected roles. */
public record AccountPrincipal(UUID accountId) implements Principal, Serializable {
    @Override
    public String getName() { return accountId.toString(); }
}
