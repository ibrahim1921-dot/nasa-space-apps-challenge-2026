package com.augustine.nasa_space_app_backend.provisioning;

import com.augustine.nasa_space_app_backend.security.AuthBeans;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.net.URI;
import java.util.*;

/** Separate interactive administrative entry point. Never starts Boot, HTTP, migration or account provisioning. */
public final class DemoSimulationScopeProvisioningCommand {
    private DemoSimulationScopeProvisioningCommand() { }

    public static void main(String[] args) {
        try {
            Map<String, String> env = System.getenv();
            UUID capture = validateTarget(args, env);
            var console = System.console();
            if (console == null) throw new IllegalArgumentException("Use an interactive terminal with hidden password input.");
            String login = console.readLine("Capture creator officer login: ");
            char[] password = console.readPassword("Officer password (hidden): ");
            try {
                var dataSource = new DriverManagerDataSource(required(env, "DB_URL"), required(env, "DB_USER"), required(env, "DB_PASSWORD"));
                // Encoder only: no application scanning, startup hooks, Flyway migration, or session secrets.
                try (var context = new AnnotationConfigApplicationContext(AuthBeans.class)) {
                    var tool = new DemoSimulationScopeProvisioner(dataSource, context.getBean(PasswordEncoder.class),
                            "true".equals(env.get("SIMULATION_SCOPE_PROVISIONING_ENABLED")),
                            "true".equals(env.get("SIMULATION_CAPTURE_REGISTRATION_ENABLED")), env.get("ASTROHEALTH_ENV"));
                    var result = tool.provision(capture, login, password);
                    console.printf("Demo technical scopes: %d created, %d verified. Audit invocation: %s%n", result.created(), result.verified(), result.invocationId());
                    result.scopes().forEach(scope -> console.printf("%s %s %s%n", scope.action(), scope.scopeCode(), scope.scopeId()));
                }
            } finally { if (password != null) Arrays.fill(password, '\0'); }
        } catch (IllegalArgumentException | DemoSimulationScopeProvisioner.ProvisioningException exception) {
            System.err.println(exception.getMessage()); System.exit(1);
        } catch (RuntimeException exception) {
            System.err.println("Scope provisioning failed and was rolled back. No existing definitions were overwritten."); System.exit(1);
        }
    }

    public static UUID validateTarget(String[] args, Map<String, String> env) {
        if (args.length != 2 || !"--provision-simulation-scopes".equals(args[0]) || !args[1].startsWith("--capture=")
                || !"development".equals(env.get("ASTROHEALTH_ENV"))
                || !"true".equals(env.get("SIMULATION_CAPTURE_REGISTRATION_ENABLED"))
                || !"true".equals(env.get("SIMULATION_SCOPE_PROVISIONING_ENABLED"))) {
            throw new IllegalArgumentException("Require explicit development mode, both demo opt-ins, --provision-simulation-scopes and --capture=<UUID>.");
        }
        UUID capture;
        try {
            String value = args[1].substring("--capture=".length()); capture = UUID.fromString(value);
            if (capture.equals(new UUID(0, 0)) || !capture.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException exception) { throw new IllegalArgumentException("Specify a canonical registered capture UUID."); }
        String url = required(env, "DB_URL");
        required(env, "DB_USER"); required(env, "DB_PASSWORD");
        try {
            if (!url.startsWith("jdbc:postgresql://")) throw new IllegalArgumentException();
            URI target = URI.create(url.substring("jdbc:".length()));
            if (!Set.of("localhost", "127.0.0.1", "[::1]").contains(Objects.toString(target.getHost(), ""))
                    || target.getUserInfo() != null || target.getQuery() != null || target.getFragment() != null
                    || target.getPath() == null || target.getPath().length() < 2) throw new IllegalArgumentException();
        } catch (IllegalArgumentException exception) { throw new IllegalArgumentException("Use an explicit loopback PostgreSQL URL without credentials or options."); }
        return capture;
    }
    private static String required(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Set " + key + " explicitly.");
        return value;
    }
}
