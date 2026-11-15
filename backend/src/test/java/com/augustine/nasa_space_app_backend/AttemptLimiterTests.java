package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.security.AttemptLimiter;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.*;

class AttemptLimiterTests {
    @Test
    void limitExpiresAndUnrelatedKeysHaveIndependentBudgets() {
        MutableClock clock = new MutableClock();
        AttemptLimiter limiter = new AttemptLimiter(clock);
        limiter.check("login:a", 1);
        assertThatThrownBy(() -> limiter.check("login:a", 1))
                .isInstanceOf(AttemptLimiter.TooManyAttemptsException.class);
        limiter.check("login:b", 1);
        clock.now = clock.now.plusSeconds(900);
        assertThatCode(() -> limiter.check("login:a", 1)).doesNotThrowAnyException();
    }

    @Test
    void capacityFailsClosedInsteadOfEvictingActiveLimits() {
        AttemptLimiter limiter = new AttemptLimiter(new MutableClock());
        for (int index = 0; index < 10_000; index++) limiter.check("key:" + index, 1);
        assertThatThrownBy(() -> limiter.check("overflow", 1))
                .isInstanceOf(AttemptLimiter.TooManyAttemptsException.class);
        assertThatThrownBy(() -> limiter.check("key:0", 1))
                .isInstanceOf(AttemptLimiter.TooManyAttemptsException.class);
    }

    private static class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-14T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
