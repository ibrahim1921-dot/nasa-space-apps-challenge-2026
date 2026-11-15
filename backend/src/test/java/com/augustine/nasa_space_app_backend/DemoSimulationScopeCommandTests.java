package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.provisioning.DemoSimulationScopeProvisioningCommand;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Pure target-validation tests; never call the interactive main or open a database connection. */
class DemoSimulationScopeCommandTests {
    private final UUID capture = UUID.randomUUID();
    private Map<String, String> environment() {
        return new HashMap<>(Map.of("ASTROHEALTH_ENV", "development", "SIMULATION_CAPTURE_REGISTRATION_ENABLED", "true",
                "SIMULATION_SCOPE_PROVISIONING_ENABLED", "true", "DB_URL", "jdbc:postgresql://localhost:5433/astrohealth",
                "DB_USER", "not-used", "DB_PASSWORD", "not-used"));
    }
    private String[] args() { return new String[]{"--provision-simulation-scopes", "--capture=" + capture}; }

    @Test
    void onlyExplicitCaptureAndLoopbackTargetsAreAccepted() {
        for (String host : List.of("localhost", "127.0.0.1", "[::1]")) {
            var env = environment(); env.put("DB_URL", "jdbc:postgresql://" + host + ":5433/example");
            assertThat(DemoSimulationScopeProvisioningCommand.validateTarget(args(), env)).isEqualTo(capture);
        }
        for (String url : List.of("jdbc:postgresql://remote.example/db", "jdbc:postgresql://localhost/db?currentSchema=public",
                "jdbc:postgresql://user:secret@localhost/db", "jdbc:postgresql://localhost/db#options", "jdbc:postgresql:db", "jdbc:postgresql://localhost/")) {
            var env = environment(); env.put("DB_URL", url);
            assertThatThrownBy(() -> DemoSimulationScopeProvisioningCommand.validateTarget(args(), env)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void optInsCredentialsCanonicalCaptureAndDevelopmentModeAreMandatory() {
        for (String key : environment().keySet()) {
            var env = environment(); env.remove(key);
            assertThatThrownBy(() -> DemoSimulationScopeProvisioningCommand.validateTarget(args(), env)).isInstanceOf(IllegalArgumentException.class);
        }
        for (String mode : List.of("production", "demo", "test")) {
            var env = environment(); env.put("ASTROHEALTH_ENV", mode);
            assertThatThrownBy(() -> DemoSimulationScopeProvisioningCommand.validateTarget(args(), env)).isInstanceOf(IllegalArgumentException.class);
        }
        for (String[] invalid : List.of(new String[0], new String[]{"--provision-fictional-demo", "--capture=" + capture},
                new String[]{"--provision-simulation-scopes", "--capture=0-0-0-0-0"},
                new String[]{"--provision-simulation-scopes", "--capture=00000000-0000-0000-0000-000000000000"},
                new String[]{"--provision-simulation-scopes", "--capture=" + capture, "--force"})) {
            assertThatThrownBy(() -> DemoSimulationScopeProvisioningCommand.validateTarget(invalid, environment())).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
