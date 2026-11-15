package com.augustine.nasa_space_app_backend.controller;

import com.augustine.nasa_space_app_backend.dto.AccountIdentity;
import com.augustine.nasa_space_app_backend.dto.LoginRequest;
import com.augustine.nasa_space_app_backend.security.AccountPrincipal;
import com.augustine.nasa_space_app_backend.security.AttemptLimiter;
import com.augustine.nasa_space_app_backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final AuthService auth;
    private final AttemptLimiter limiter;
    private final SessionAuthenticationStrategy sessions;
    private final SecurityContextRepository contexts;
    private final LogoutHandler logout;

    public AuthController(AuthenticationManager authenticationManager, AuthService auth,
                          AttemptLimiter limiter,
                          SessionAuthenticationStrategy sessions, SecurityContextRepository contexts,
                          LogoutHandler logout) {
        this.authenticationManager = authenticationManager;
        this.auth = auth;
        this.limiter = limiter;
        this.sessions = sessions;
        this.contexts = contexts;
        this.logout = logout;
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/login")
    public AccountIdentity login(@Valid @RequestBody LoginRequest credentials,
                                 HttpServletRequest request, HttpServletResponse response) {
        limiter.check("login-name:" + AuthService.normalizeLogin(credentials.loginName()), 5);
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(credentials.loginName(), credentials.password()));
        AccountPrincipal principal = (AccountPrincipal) authentication.getPrincipal();
        AccountIdentity identity = auth.currentIdentity(principal.accountId());
        sessions.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return identity;
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        logout.logout(request, response, authentication);
    }

    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('ASTRONAUT', 'NASA_OFFICER')")
    public AccountIdentity me(@AuthenticationPrincipal AccountPrincipal principal) {
        return auth.currentIdentity(principal.accountId());
    }

    public record CsrfResponse(String headerName, String token) { }
}
