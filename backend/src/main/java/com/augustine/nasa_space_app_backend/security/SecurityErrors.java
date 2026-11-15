package com.augustine.nasa_space_app_backend.security;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/** Fixed messages only; never serialize authentication failures or raw exceptions. */
public final class SecurityErrors {
    private SecurityErrors() { }

    public static void write(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        String message = switch (status) {
            case 401 -> "Authentication required.";
            case 429 -> "Too many attempts. Try again later.";
            case 503 -> "Authentication temporarily unavailable.";
            default -> "Access denied.";
        };
        if (status == 429) response.setHeader("Retry-After", "900");
        response.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
