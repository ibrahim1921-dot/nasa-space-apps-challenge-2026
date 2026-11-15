package com.augustine.nasa_space_app_backend.provisioning;

import com.augustine.nasa_space_app_backend.security.AuthBeans;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.io.Console;
import java.net.URI;
import java.util.Arrays;
import java.util.Map;
import java.util.Set;

/** Separate, interactive local-development command. Never launches Spring Boot, Flyway, or HTTP. */
public final class DemoProvisioningCommand {
    private DemoProvisioningCommand() { }

    public static void main(String[] args) {
        try {
            validateTarget(args, System.getenv());
            Console console = System.console();
            if (console == null) throw new IllegalArgumentException("Run in an interactive terminal with hidden password input.");
            String url = required(System.getenv(), "DB_URL");
            String user = required(System.getenv(), "DB_USER");
            String databasePassword = required(System.getenv(), "DB_PASSWORD");
            DriverManagerDataSource dataSource = new DriverManagerDataSource(url, user, databasePassword);
            // Import only the existing encoder configuration; no application scan, runners, or migrations.
            try (var context = new AnnotationConfigApplicationContext(AuthBeans.class)) {
                DemoAccountProvisioner provisioner = new DemoAccountProvisioner(dataSource, context.getBean(PasswordEncoder.class));
                DemoAccountProvisioner.Result result = provisioner.provision(login -> readPassword(console, login));
                console.printf("Fictional demo accounts: %d created, %d unchanged.%n",
                        result.createdAccounts(), result.skippedAccounts());
            }
        } catch (IllegalArgumentException | DemoAccountProvisioner.ProvisioningException exception) {
            // Messages originate only from our fixed validation rules, never password/SQL exception details.
            System.err.println(exception.getMessage());
            System.exit(1);
        } catch (RuntimeException exception) {
            System.err.println("Provisioning failed. The transaction was rolled back; existing credentials were not overwritten.");
            System.exit(1);
        }
    }

    public static void validateTarget(String[] args, Map<String, String> environment) {
        if (args.length != 1 || !"--provision-fictional-demo".equals(args[0])
                || !"development".equals(environment.get("ASTROHEALTH_ENV"))) {
            throw new IllegalArgumentException("Require ASTROHEALTH_ENV=development and --provision-fictional-demo.");
        }
        String url = required(environment, "DB_URL");
        URI uri;
        try {
            if (!url.startsWith("jdbc:postgresql://")) throw new IllegalArgumentException();
            uri = URI.create(url.substring("jdbc:".length()));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Use an explicit local PostgreSQL JDBC URL.");
        }
        if (!Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost() == null ? "" : uri.getHost())
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || uri.getPath() == null || uri.getPath().length() < 2) {
            throw new IllegalArgumentException("Demo provisioning accepts only a loopback database URL without URL credentials or options.");
        }
    }

    private static String required(Map<String, String> environment, String name) {
        String value = environment.get(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Set " + name + " explicitly.");
        return value;
    }

    private static char[] readPassword(Console console, String login) {
        char[] password = console.readPassword("Initial password for %s: ", login);
        char[] confirmation = console.readPassword("Confirm password for %s: ", login);
        try {
            if (password == null || confirmation == null || !Arrays.equals(password, confirmation)) {
                if (password != null) Arrays.fill(password, '\0');
                throw new DemoAccountProvisioner.ProvisioningException("Password confirmation failed; provisioning was rolled back.");
            }
            return password;
        } finally {
            if (confirmation != null) Arrays.fill(confirmation, '\0');
        }
    }
}
