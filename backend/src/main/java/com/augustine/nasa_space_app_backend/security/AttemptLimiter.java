package com.augustine.nasa_space_app_backend.security;

import org.springframework.stereotype.Component;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/** Fixed windows; bounded memory, fail closed at capacity, suitable for one server instance. */
@Component
public class AttemptLimiter {
    private static final int MAX_KEYS = 10_000;
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private final Map<String, Window> windows = new HashMap<>();
    private final Clock clock;

    public AttemptLimiter(Clock clock) { this.clock = clock; }

    public synchronized void check(String key, int limit) {
        long now = clock.millis();
        windows.entrySet().removeIf(entry -> entry.getValue().expiresAt <= now);
        Window window = windows.get(key);
        if (window == null) {
            if (windows.size() >= MAX_KEYS) throw new TooManyAttemptsException();
            window = new Window(now + WINDOW.toMillis());
            windows.put(key, window);
        }
        if (window.count >= limit) throw new TooManyAttemptsException();
        window.count++;
    }

    public static class TooManyAttemptsException extends RuntimeException {
        public TooManyAttemptsException() { super("Too many attempts. Try again later."); }
    }

    private static final class Window {
        private final long expiresAt;
        private int count;
        private Window(long expiresAt) { this.expiresAt = expiresAt; }
    }
}
