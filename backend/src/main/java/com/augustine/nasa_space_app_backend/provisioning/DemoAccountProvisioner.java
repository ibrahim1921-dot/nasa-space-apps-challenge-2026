package com.augustine.nasa_space_app_backend.provisioning;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationState;
import org.flywaydb.core.api.MigrationVersion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Explicit tool helper, deliberately not a Spring component or startup runner. */
public final class DemoAccountProvisioner {
    private static final List<DemoIdentity> DEMO_IDENTITIES = List.of(
            new DemoIdentity("maya.demo", "crew-01", "Maya Okafor"),
            new DemoIdentity("tomas.demo", "crew-02", "Tomas Reyes"),
            new DemoIdentity("lena.demo", "crew-03", "Lena Kowalski"),
            new DemoIdentity("kwame.demo", "crew-04", "Kwame Asante"),
            new DemoIdentity("officer.demo", null, null));

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final TransactionTemplate transaction;
    private final DataSource dataSource;

    public DemoAccountProvisioner(DataSource dataSource, PasswordEncoder passwords) {
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
        this.passwords = passwords;
        this.transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.transaction.setTimeout(300); // Allows private interactive password entry.
    }

    public Result provision(PasswordSource source) {
        verifyMigrations();
        return transaction.execute(status -> {
            // Serialize simultaneous invocations of this tool, not normal application traffic.
            jdbc.execute("SELECT pg_advisory_xact_lock(7262110030)");
            int created = 0;
            int skipped = 0;
            for (DemoIdentity identity : DEMO_IDENTITIES) {
                UUID profileId = identity.crewCode() == null ? null : findOrCreateProfile(identity);
                String role = profileId == null ? "NASA_OFFICER" : "ASTRONAUT";
                List<ExistingAccount> existing = jdbc.query("SELECT login_name, role, astronaut_id FROM accounts "
                                + "WHERE login_name = ? OR astronaut_id = ? FOR UPDATE",
                        (row, index) -> new ExistingAccount(row.getString("login_name"), row.getString("role"),
                                row.getObject("astronaut_id", UUID.class)), identity.loginName(), profileId);
                if (!existing.isEmpty()) {
                    if (existing.size() != 1 || !existing.get(0).matches(identity.loginName(), role, profileId)) {
                        throw new ProvisioningException("An existing account conflicts with the fictional demo identities.");
                    }
                    // Never change password, enabled state, role, profile link, or version on rerun.
                    skipped++;
                    continue;
                }
                char[] password = source.readPassword(identity.loginName());
                try {
                    if (!acceptablePassword(password)) {
                        throw new ProvisioningException("Passwords require 15 characters and at most 72 UTF-8 bytes.");
                    }
                    String hash = passwords.encode(CharBuffer.wrap(password));
                    jdbc.update("INSERT INTO accounts (login_name, password_hash, role, astronaut_id) VALUES (?, ?, ?, ?)",
                            identity.loginName(), hash, role, profileId);
                    created++;
                } finally {
                    if (password != null) Arrays.fill(password, '\0');
                }
            }
            return new Result(created, skipped);
        });
    }

    private void verifyMigrations() {
        String failure = "Apply and verify migrations through at least V30 separately before provisioning.";
        try {
            var configuration = Flyway.configure().dataSource(dataSource)
                    .locations("classpath:db/migration").cleanDisabled(true)
                    .ignoreMigrationPatterns(new String[0]);
            var current = configuration.load().info().current();
            MigrationVersion required = MigrationVersion.fromVersion("30");
            if (current == null || current.getVersion() == null
                    || current.getVersion().compareTo(required) < 0) {
                throw new ProvisioningException(failure);
            }
            // Validate only through the applied version: V30 remains usable with V31 pending.
            // No migrate, repair, baseline, clean, or schema creation is performed here.
            Flyway flyway = configuration.target(current.getVersion()).load();
            flyway.validate();
            var migrations = flyway.info().all();
            boolean hasV30 = false;
            for (var migration : migrations) {
                if (migration.getVersion() != null
                        && migration.getVersion().compareTo(current.getVersion()) <= 0) {
                    if (migration.getState() != MigrationState.SUCCESS) {
                        throw new ProvisioningException(failure);
                    }
                    if (migration.getVersion().equals(required)) hasV30 = true;
                }
            }
            if (!hasV30) throw new ProvisioningException(failure);
        } catch (RuntimeException exception) {
            // Keep connection details and Flyway/SQL errors out of the command's output.
            // A connection failure says nothing about the applied schema version.
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && sql.getSQLState() != null) {
                    if (sql.getSQLState().startsWith("28")) {
                        throw new ProvisioningException("Database authentication failed. Check DB_USER and DB_PASSWORD for the approved local database.");
                    }
                    if (sql.getSQLState().startsWith("08")) {
                        throw new ProvisioningException("Database connection failed. Check DB_URL and that the approved local database is running.");
                    }
                }
            }
            throw new ProvisioningException(failure);
        }
    }

    private UUID findOrCreateProfile(DemoIdentity identity) {
        List<ExistingProfile> profiles = jdbc.query(
                "SELECT id, display_name, archived_at IS NOT NULL AS archived FROM astronauts WHERE crew_code = ? FOR UPDATE",
                (row, index) -> new ExistingProfile(row.getObject("id", UUID.class),
                        row.getString("display_name"), row.getBoolean("archived")), identity.crewCode());
        if (!profiles.isEmpty()) {
            ExistingProfile profile = profiles.get(0);
            if (!identity.displayName().equals(profile.displayName()) || profile.archived()) {
                throw new ProvisioningException("An existing profile conflicts with the active fictional demo roster.");
            }
            return profile.id();
        }
        return jdbc.queryForObject("INSERT INTO astronauts (crew_code, display_name) VALUES (?, ?) RETURNING id",
                UUID.class, identity.crewCode(), identity.displayName());
    }

    private static boolean acceptablePassword(char[] password) {
        if (password == null || password.length > 72 || Character.codePointCount(password, 0, password.length) < 15) return false;
        var characters = CharBuffer.wrap(password);
        if (characters.codePoints().allMatch(Character::isWhitespace)) return false;
        var bytes = StandardCharsets.UTF_8.encode(characters);
        try {
            return bytes.remaining() <= 72;
        } finally {
            if (bytes.hasArray()) Arrays.fill(bytes.array(), (byte) 0);
        }
    }

    @FunctionalInterface
    public interface PasswordSource {
        /** Returns a private password buffer; the provisioner clears it after use. */
        char[] readPassword(String loginName);
    }

    public record Result(int createdAccounts, int skippedAccounts) { }
    private record DemoIdentity(String loginName, String crewCode, String displayName) { }
    private record ExistingProfile(UUID id, String displayName, boolean archived) { }
    private record ExistingAccount(String loginName, String role, UUID astronautId) {
        boolean matches(String login, String expectedRole, UUID profileId) {
            return loginName.equals(login) && role.equals(expectedRole) && Objects.equals(astronautId, profileId);
        }
    }

    public static final class ProvisioningException extends RuntimeException {
        public ProvisioningException(String message) { super(message); }
    }
}
