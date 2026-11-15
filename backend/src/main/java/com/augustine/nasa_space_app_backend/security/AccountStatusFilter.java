package com.augustine.nasa_space_app_backend.security;

import com.augustine.nasa_space_app_backend.service.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Recheck database state before every authenticated request, never trust cached roles/profile state. */
public class AccountStatusFilter extends OncePerRequestFilter {
    private final AuthService auth;
    private final LogoutHandler logout;

    public AccountStatusFilter(AuthService auth, LogoutHandler logout) {
        this.auth = auth;
        this.logout = logout;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof AccountPrincipal principal) {
            try {
                var identity = auth.currentIdentity(principal.accountId());
                // A fresh context avoids modifying the shared session context across concurrent requests.
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(AuthService.authenticationFor(identity));
                SecurityContextHolder.setContext(context);
            } catch (AuthenticationException exception) {
                logout.logout(request, response, authentication);
                SecurityErrors.write(response, 401);
                return;
            } catch (DataAccessException | TransactionException exception) {
                // A failed database check must never grant access or reveal raw SQL details.
                SecurityErrors.write(response, 503);
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
