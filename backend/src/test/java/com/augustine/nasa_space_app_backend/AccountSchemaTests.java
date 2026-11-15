package com.augustine.nasa_space_app_backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AccountSchemaTests extends PostgreSqlIntegrationTest {

    private static final String TEST_HASH = "$2a$12$" + "a".repeat(53);

    @Autowired private DataSource dataSource;
    @Autowired private Flyway flyway;
    @Autowired private Environment environment;

    @Test
    void allMigrationsAreAppliedAndChecksumsValidate() throws SQLException {
        flyway.validate();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("35");
        assertThat(flyway.info().applied()).hasSize(35);
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement("SHOW server_version_num");
             ResultSet result = statement.executeQuery()) {
            result.next();
            assertThat(result.getInt(1)).isBetween(170000, 179999);
        }
    }

    @Test
    void existingV29SchemaUpgradesWithoutChangingAstronautIdentity() throws SQLException {
        // A second schema in the disposable container models an already migrated installation.
        // No development URL, Flyway clean, DROP, or reset is used.
        Flyway upgrade;
        try (Connection connection = dataSource.getConnection()) {
            upgrade = Flyway.configure().dataSource(connection.getMetaData().getURL(),
                            connection.getMetaData().getUserName(),
                            environment.getRequiredProperty("spring.datasource.password"))
                    .defaultSchema("phase1_upgrade").schemas("phase1_upgrade")
                    .locations("classpath:db/migration").target("29").cleanDisabled(true).load();
        }
        upgrade.migrate();
        UUID id;
        try (Connection connection = dataSource.getConnection()) {
            // Qualify the test schema instead of changing pooled connection state. Other tests
            // (including concurrent workers) must always receive the original default schema.
            id = insertId(connection, "INSERT INTO phase1_upgrade.astronauts (crew_code, display_name) VALUES (?, ?) RETURNING id",
                    "upgrade-01", "Upgrade Astronaut");
        }
        Flyway latest = Flyway.configure().configuration(upgrade.getConfiguration()).target("latest").load();
        assertThat(latest.migrate().migrationsExecuted).isEqualTo(6);
        latest.validate();
        try (Connection connection = dataSource.getConnection()) {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT crew_code, display_name, archived_at FROM phase1_upgrade.astronauts WHERE id = ?")) {
                statement.setObject(1, id);
                try (ResultSet result = statement.executeQuery()) {
                    assertThat(result.next()).isTrue();
                    assertThat(result.getString(1)).isEqualTo("upgrade-01");
                    assertThat(result.getString(2)).isEqualTo("Upgrade Astronaut");
                    assertThat(result.getObject(3)).isNull();
                }
            }
        }
    }

    @Test
    void accountsEnforceRoleProfileUniquenessForeignKeysAndHashFormat() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                UUID astronaut = astronaut(connection, "schema-01");
                UUID second = astronaut(connection, "schema-02");
                account(connection, "schema.astronaut", TEST_HASH, "ASTRONAUT", astronaut);
                account(connection, "schema.officer", TEST_HASH, "NASA_OFFICER", null);
                account(connection, "schema.officer2", TEST_HASH, "NASA_OFFICER", null);

                expectSqlState(connection, "23505", () -> account(connection,
                        "other.astronaut", TEST_HASH, "ASTRONAUT", astronaut));
                expectSqlState(connection, "23505", () -> account(connection,
                        "schema.astronaut", TEST_HASH, "ASTRONAUT", second));
                expectSqlState(connection, "23514", () -> account(connection,
                        "no.profile", TEST_HASH, "ASTRONAUT", null));
                expectSqlState(connection, "23514", () -> account(connection,
                        "linked.officer", TEST_HASH, "NASA_OFFICER", second));
                expectSqlState(connection, "23514", () -> account(connection,
                        "unknown.role", TEST_HASH, "ADMIN", null));
                expectSqlState(connection, "23503", () -> account(connection,
                        "missing.profile", TEST_HASH, "ASTRONAUT", UUID.randomUUID()));
                expectSqlState(connection, "23514", () -> account(connection,
                        "raw.password", "not-a-password-hash", "NASA_OFFICER", null));
                expectSqlState(connection, "23514", () -> account(connection,
                        "Mixed.Case", TEST_HASH, "NASA_OFFICER", null));
                expectSqlState(connection, "23503", () -> execute(connection,
                        "DELETE FROM astronauts WHERE id = ?", astronaut));
            } finally {
                connection.rollback();
            }
        }
    }

    @Test
    void invitationsEnforcePendingUniquenessHashExpiryAttemptsAndTerminalStates() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                UUID astronaut = astronaut(connection, "schema-03");
                UUID second = astronaut(connection, "schema-04");
                UUID officer = account(connection, "schema.issuer", TEST_HASH, "NASA_OFFICER", null);
                UUID invitation = activation(connection, astronaut, "invite.one", "a".repeat(64), officer);
                expectSqlState(connection, "23505", () -> activation(connection,
                        astronaut, "invite.two", "b".repeat(64), officer));
                expectSqlState(connection, "23505", () -> activation(connection,
                        second, "invite.one", "b".repeat(64), officer));
                expectSqlState(connection, "23505", () -> activation(connection,
                        second, "invite.two", "a".repeat(64), officer));
                expectSqlState(connection, "23514", () -> activation(connection,
                        second, "invite.two", "raw-credential", officer));
                expectSqlState(connection, "23503", () -> activation(connection,
                        UUID.randomUUID(), "invite.two", "b".repeat(64), officer));
                expectSqlState(connection, "23503", () -> activation(connection,
                        second, "invite.two", "b".repeat(64), UUID.randomUUID()));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET expires_at = created_at WHERE id = ?", invitation));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET consumed_at = expires_at WHERE id = ?", invitation));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET failed_attempts = 6 WHERE id = ?", invitation));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET failed_attempts = -1 WHERE id = ?", invitation));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET consumed_at = created_at, revoked_at = created_at WHERE id = ?",
                        invitation));
                execute(connection, "UPDATE astronaut_activations SET failed_attempts = 5 WHERE id = ?", invitation);
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET failed_attempts = 0 WHERE id = ?", invitation));
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET consumed_at = created_at WHERE id = ?", invitation));
                // Exhaustion does not silently free the pending slot; replacement must revoke first.
                expectSqlState(connection, "23505", () -> activation(connection,
                        astronaut, "invite.two", "b".repeat(64), officer));
                execute(connection, "UPDATE astronaut_activations SET revoked_at = created_at WHERE id = ?", invitation);
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET revoked_at = NULL WHERE id = ?", invitation));
                UUID replacement = activation(connection, astronaut, "invite.one", "b".repeat(64), officer);
                execute(connection, "UPDATE astronaut_activations SET consumed_at = created_at WHERE id = ?", replacement);
                expectSqlState(connection, "23514", () -> execute(connection,
                        "UPDATE astronaut_activations SET consumed_at = NULL WHERE id = ?", replacement));
                // Trusted operator provisioning has no issuer account; historical digest remains unique.
                activation(connection, astronaut, "invite.one", "c".repeat(64), null);
                expectSqlState(connection, "23503", () -> execute(connection,
                        "DELETE FROM accounts WHERE id = ?", officer));
            } finally {
                connection.rollback();
            }
        }
    }

    private UUID astronaut(Connection connection, String code) throws SQLException {
        return insertId(connection, "INSERT INTO astronauts (crew_code, display_name) VALUES (?, ?) RETURNING id",
                code, "Schema Test Astronaut");
    }

    private UUID account(Connection connection, String login, String hash, String role, UUID astronaut)
            throws SQLException {
        return insertId(connection, "INSERT INTO accounts (login_name, password_hash, role, astronaut_id) "
                + "VALUES (?, ?, ?, ?) RETURNING id", login, hash, role, astronaut);
    }

    private UUID activation(Connection connection, UUID astronaut, String login, String hash, UUID officer)
            throws SQLException {
        return insertId(connection, "INSERT INTO astronaut_activations "
                        + "(astronaut_id, login_name, credential_hash, expires_at, issued_by_account_id) "
                        + "VALUES (?, ?, ?, ?, ?) RETURNING id", astronaut, login, hash,
                OffsetDateTime.now(ZoneOffset.UTC).plusDays(1), officer);
    }

    private UUID insertId(Connection connection, String sql, Object... parameters) throws SQLException {
        try (PreparedStatement statement = prepare(connection, sql, parameters);
             ResultSet result = statement.executeQuery()) {
            result.next();
            return result.getObject(1, UUID.class);
        }
    }

    private void execute(Connection connection, String sql, Object... parameters) throws SQLException {
        try (PreparedStatement statement = prepare(connection, sql, parameters)) {
            statement.executeUpdate();
        }
    }

    private PreparedStatement prepare(Connection connection, String sql, Object... parameters) throws SQLException {
        PreparedStatement statement = connection.prepareStatement(sql);
        for (int index = 0; index < parameters.length; index++) {
            statement.setObject(index + 1, parameters[index]);
        }
        return statement;
    }

    private void expectSqlState(Connection connection, String expected, SqlOperation operation) throws SQLException {
        Savepoint savepoint = connection.setSavepoint();
        String actual = null;
        try {
            operation.run();
        } catch (SQLException exception) {
            // Do not print PostgreSQL error details: they can contain credential/hash values.
            actual = exception.getSQLState();
        } finally {
            connection.rollback(savepoint);
            connection.releaseSavepoint(savepoint);
        }
        assertThat(actual).isEqualTo(expected);
    }

    @FunctionalInterface
    private interface SqlOperation {
        void run() throws SQLException;
    }
}
