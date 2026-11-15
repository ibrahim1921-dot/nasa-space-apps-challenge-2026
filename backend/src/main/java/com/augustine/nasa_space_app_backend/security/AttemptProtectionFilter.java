package com.augustine.nasa_space_app_backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

public class AttemptProtectionFilter extends OncePerRequestFilter {
    private final AttemptLimiter limiter;

    public AttemptProtectionFilter(AttemptLimiter limiter) { this.limiter = limiter; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equals(request.getMethod())) {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            try {
                // Do not trust X-Forwarded-For supplied by a client. See deployment notes for proxies.
                if (path.equals("/api/auth/login")) limiter.check("login-ip:" + request.getRemoteAddr(), 30);
            } catch (AttemptLimiter.TooManyAttemptsException exception) {
                SecurityErrors.write(response, 429);
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
