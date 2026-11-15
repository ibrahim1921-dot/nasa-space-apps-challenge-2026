package com.augustine.nasa_space_app_backend.service;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.entity.Account;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import jakarta.validation.Validator;
import com.augustine.nasa_space_app_backend.dto.LoginRequest;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthService implements AuthenticationProvider {
    private final AccountRepository accounts;
    private final AstronautRepository astronauts;
    private final PasswordEncoder passwords;
    private final Validator validator;
    private final String dummyHash;

    public AuthService(AccountRepository accounts, AstronautRepository astronauts,
                       PasswordEncoder passwords, Validator validator) {
        this.accounts = accounts;
        this.astronauts = astronauts;
        this.passwords = passwords;
        this.validator = validator;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Override
    @Transactional(readOnly = true)
    public Authentication authenticate(Authentication authentication) {
        LoginRequest request = new LoginRequest(authentication.getName(),
                authentication.getCredentials() instanceof String value ? value : null);
        if (!validator.validate(request).isEmpty()) throw invalidCredentials();
        Account account = accounts.findByLoginName(normalizeLogin(request.loginName())).orElse(null);
        // Unknown logins still perform a BCrypt verification; no account-existence message.
        boolean matches = passwords.matches(request.password(), account == null ? dummyHash : account.getPasswordHash());
        if (account == null || !matches || !account.isEnabled()) throw invalidCredentials();
        AccountIdentity identity = identityFor(account);
        return authenticationFor(identity);
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }

    @Transactional(readOnly = true)
    public AccountIdentity currentIdentity(UUID accountId) {
        Account account = accounts.findById(accountId).filter(Account::isEnabled)
                .orElseThrow(AuthService::invalidCredentials);
        return identityFor(account);
    }

    private AccountIdentity identityFor(Account account) {
        AccountIdentity.Profile profile = null;
        if (account.getRole() == AccountRole.ASTRONAUT) {
            Astronaut astronaut = astronauts.findById(account.getAstronautId())
                    .filter(value -> value.getArchivedAt() == null).orElseThrow(AuthService::invalidCredentials);
            profile = new AccountIdentity.Profile(astronaut.getId(), astronaut.getCrewCode(), astronaut.getDisplayName());
        }
        return new AccountIdentity(account.getId(), account.getLoginName(), account.getRole(), profile);
    }

    public static Authentication authenticationFor(AccountIdentity identity) {
        return UsernamePasswordAuthenticationToken.authenticated(new AccountPrincipal(identity.accountId()),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + identity.role().name())));
    }

    public static String normalizeLogin(String login) { return login.toLowerCase(Locale.ROOT); }

    private static BadCredentialsException invalidCredentials() {
        return new BadCredentialsException("Invalid login credentials.");
    }
}
