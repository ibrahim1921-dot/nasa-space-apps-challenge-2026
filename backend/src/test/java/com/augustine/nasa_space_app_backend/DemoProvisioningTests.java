package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.provisioning.DemoAccountProvisioner;
import com.augustine.nasa_space_app_backend.provisioning.DemoProvisioningCommand;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.core.env.Environment;
import org.flywaydb.core.Flyway;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;

class DemoProvisioningTests extends PostgreSqlIntegrationTest {
    @Autowired private DataSource dataSource;
    @Autowired private PasswordEncoder passwords;
    @Autowired private ApplicationContext context;
    @Autowired private Environment environment;

    @Test
    void explicitToolCreatesFourLinkedAstronautsAndSeparateOfficerWithHashedPasswords() {
        rollback(() -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            DemoAccountProvisioner provisioner = new DemoAccountProvisioner(dataSource, passwords);
            List<char[]> buffers = new ArrayList<>();
            String password = "Operator test passphrase " + UUID.randomUUID();
            var result = provisioner.provision(login -> {
                char[] buffer = password.toCharArray();
                buffers.add(buffer);
                return buffer;
            });
            assertThat(result.createdAccounts()).isEqualTo(5);
            assertThat(result.skippedAccounts()).isZero();
            for (String login : List.of("maya.demo", "tomas.demo", "lena.demo", "kwame.demo")) {
                var row = jdbc.queryForMap("SELECT a.role, a.password_hash, p.crew_code FROM accounts a "
                        + "JOIN astronauts p ON p.id = a.astronaut_id WHERE a.login_name = ?", login);
                assertThat(row.get("role")).isEqualTo("ASTRONAUT");
                assertThat(row.get("crew_code")).isIn("crew-01", "crew-02", "crew-03", "crew-04");
                assertThat(passwords.matches(password, (String) row.get("password_hash"))).isTrue();
            }
            var officer = jdbc.queryForMap("SELECT role, astronaut_id, password_hash FROM accounts WHERE login_name = 'officer.demo'");
            assertThat(officer.get("role")).isEqualTo("NASA_OFFICER");
            assertThat(officer.get("astronaut_id")).isNull();
            assertThat(passwords.matches(password, (String) officer.get("password_hash"))).isTrue();
            assertThat(buffers).hasSize(5);
            assertThat(buffers.stream().allMatch(buffer -> java.nio.CharBuffer.wrap(buffer).chars().allMatch(value -> value == 0)))
                    .isTrue();
        });
    }

    @Test
    void rerunPreservesUuidCrewCodeCredentialsAndDisabledStateWithoutPasswordPrompts() {
        rollback(() -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            UUID id = jdbc.queryForObject("INSERT INTO astronauts (crew_code, display_name) "
                    + "VALUES ('crew-01', 'Maya Okafor') RETURNING id", UUID.class);
            DemoAccountProvisioner provisioner = new DemoAccountProvisioner(dataSource, passwords);
            provisioner.provision(login -> ("First operator passphrase " + login).toCharArray());
            jdbc.update("UPDATE accounts SET enabled = FALSE WHERE login_name = 'maya.demo'");
            String originalHash = jdbc.queryForObject("SELECT password_hash FROM accounts WHERE login_name = 'maya.demo'", String.class);
            var result = provisioner.provision(login -> { throw new AssertionError("Existing accounts must not prompt or reset credentials"); });
            assertThat(result.createdAccounts()).isZero();
            assertThat(result.skippedAccounts()).isEqualTo(5);
            assertThat(jdbc.queryForObject("SELECT id FROM astronauts WHERE crew_code = 'crew-01'", UUID.class)).isEqualTo(id);
            assertThat(jdbc.queryForObject("SELECT astronaut_id FROM accounts WHERE login_name = 'maya.demo'", UUID.class)).isEqualTo(id);
            assertThat(jdbc.queryForObject("SELECT enabled FROM accounts WHERE login_name = 'maya.demo'", Boolean.class)).isFalse();
            assertThat(originalHash.equals(jdbc.queryForObject("SELECT password_hash FROM accounts WHERE login_name = 'maya.demo'", String.class)))
                    .isTrue();
        });
    }

    @Test
    void conflictingIdentityIsRejectedWithoutChangingProfileOrExistingCredentials() {
        rollback(() -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            UUID id = jdbc.queryForObject("INSERT INTO astronauts (crew_code, display_name) "
                    + "VALUES ('crew-01', 'Another Person') RETURNING id", UUID.class);
            assertThatThrownBy(() -> new DemoAccountProvisioner(dataSource, passwords).provision(login -> {
                throw new AssertionError("Conflicting profile must be rejected before password entry");
            })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
            assertThat(jdbc.queryForObject("SELECT display_name FROM astronauts WHERE id = ?", String.class, id)).isEqualTo("Another Person");
        });
    }

    @Test
    void mismatchedRoleAndArchivedProfileAreRejected() {
        rollback(() -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            jdbc.update("INSERT INTO astronauts (crew_code, display_name, archived_at) VALUES ('crew-01', 'Maya Okafor', CURRENT_TIMESTAMP)");
            assertThatThrownBy(() -> new DemoAccountProvisioner(dataSource, passwords).provision(login -> {
                throw new AssertionError("Archived profile must not be reactivated");
            })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
        });
        rollback(() -> {
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            jdbc.update("INSERT INTO accounts (login_name, password_hash, role) VALUES ('maya.demo', ?, 'NASA_OFFICER')",
                    passwords.encode("Existing officer test passphrase"));
            assertThatThrownBy(() -> new DemoAccountProvisioner(dataSource, passwords).provision(login -> {
                throw new AssertionError("Existing roles must never be reassigned");
            })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
            assertThat(jdbc.queryForObject("SELECT role FROM accounts WHERE login_name = 'maya.demo'", String.class)).isEqualTo("NASA_OFFICER");
        });
    }

    @Test
    void invalidPasswordClearsBufferAndPreventsBatchCommit() {
        // No outer test transaction: verify the tool's own rollback removes the first account
        // and both inserted profiles when the operator supplies an invalid second password.
        char[] shortPassword = "too short".toCharArray();
        AtomicInteger calls = new AtomicInteger();
        assertThatThrownBy(() -> new DemoAccountProvisioner(dataSource, passwords).provision(login -> {
            if (calls.incrementAndGet() == 2) return shortPassword;
            return "Valid operator test passphrase".toCharArray();
        })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
        assertThat(java.nio.CharBuffer.wrap(shortPassword).chars().allMatch(value -> value == 0)).isTrue();
        assertThat(new JdbcTemplate(dataSource).queryForObject(
                "SELECT COUNT(*) FROM accounts WHERE login_name IN ('maya.demo', 'tomas.demo')", Integer.class)).isZero();
        assertThat(new JdbcTemplate(dataSource).queryForObject(
                "SELECT COUNT(*) FROM astronauts WHERE crew_code IN ('crew-01', 'crew-02')", Integer.class)).isZero();
    }

    @Test
    void commandRequiresExplicitDevelopmentOptInAndLocalDatabaseAndIsNotAStartupBean() {
        Map<String, String> local = Map.of("ASTROHEALTH_ENV", "development", "DB_URL", "jdbc:postgresql://localhost:5433/astrohealth");
        assertThatCode(() -> DemoProvisioningCommand.validateTarget(new String[]{"--provision-fictional-demo"}, local))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> DemoProvisioningCommand.validateTarget(new String[0], local)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DemoProvisioningCommand.validateTarget(new String[]{"--provision-fictional-demo"},
                Map.of("ASTROHEALTH_ENV", "production", "DB_URL", local.get("DB_URL")))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DemoProvisioningCommand.validateTarget(new String[]{"--provision-fictional-demo"},
                Map.of("ASTROHEALTH_ENV", "development", "DB_URL", "jdbc:postgresql://production.example/astrohealth")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DemoProvisioningCommand.validateTarget(new String[]{"--provision-fictional-demo"},
                Map.of("ASTROHEALTH_ENV", "development", "DB_URL", local.get("DB_URL") + "?password=forbidden")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(context.getBeansOfType(DemoAccountProvisioner.class)).isEmpty();
        assertThat(context.getBeansOfType(DemoProvisioningCommand.class)).isEmpty();
    }

    @Test
    void v29DatabaseIsRejectedWithoutApplyingV30OrPromptingForPasswords() {
        // A separate schema in the disposable test container; never the development DB.
        String url = environment.getRequiredProperty("spring.datasource.url");
        String user = environment.getRequiredProperty("spring.datasource.username");
        String databasePassword = environment.getRequiredProperty("spring.datasource.password");
        Flyway schema = Flyway.configure().dataSource(url, user, databasePassword)
                .defaultSchema("provisioning_v29_guard").schemas("provisioning_v29_guard")
                .locations("classpath:db/migration").target("29").cleanDisabled(true).load();
        schema.migrate();
        DriverManagerDataSource v29 = new DriverManagerDataSource(
                url + (url.contains("?") ? "&" : "?") + "currentSchema=provisioning_v29_guard", user, databasePassword);
        assertThatThrownBy(() -> new DemoAccountProvisioner(v29, passwords).provision(login -> {
            throw new AssertionError("V29 must be rejected before reading credentials");
        })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
        assertThat(schema.info().current().getVersion().getVersion()).isEqualTo("29");
        assertThat(new JdbcTemplate(v29).queryForObject("SELECT COUNT(*) FROM astronauts", Integer.class)).isZero();
        assertThat(new JdbcTemplate(v29).queryForObject("SELECT to_regclass('accounts')::text", String.class)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"30", "31", "38"})
    void verifiedAccountSchemaAcceptsKnownVersionsWithoutMigrating(String version) {
        DataSource target = migrationFixture(version);
        JdbcTemplate jdbc = new JdbcTemplate(target);
        // Stop at the first prompt; the transaction rolls back without creating demo data.
        AssertionError reachedPasswordPrompt = new AssertionError("Verified migration state accepted");
        assertThatThrownBy(() -> new DemoAccountProvisioner(target, passwords).provision(login -> {
            throw reachedPasswordPrompt;
        })).isSameAs(reachedPasswordPrompt);
        assertThat(jdbc.queryForObject("SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1",
                String.class)).isEqualTo(version);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM astronauts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT to_regclass('simulation_captures')::text", String.class))
                .isEqualTo(!version.equals("30") ? "simulation_captures" : null);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "DROP TABLE flyway_schema_history",
            "DELETE FROM flyway_schema_history",
            "DELETE FROM flyway_schema_history WHERE version = '30'",
            "DELETE FROM flyway_schema_history WHERE version = '29'",
            "UPDATE flyway_schema_history SET success = FALSE WHERE version = '31'",
            "UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '30'",
            "UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '31'",
            "UPDATE flyway_schema_history SET version = '999' WHERE version = '31'"
    })
    void invalidMigrationHistoryIsRejectedBeforePasswordsOrDemoWrites(String corruption) {
        DataSource target = migrationFixture("31");
        JdbcTemplate jdbc = new JdbcTemplate(target);
        jdbc.execute(corruption);
        assertThatThrownBy(() -> new DemoAccountProvisioner(target, passwords).provision(login -> {
            throw new AssertionError("Invalid migration state must fail before password entry");
        })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM astronauts", Integer.class)).isZero();
    }

    @Test
    void wrongDatabaseCredentialReportsAuthenticationFailureBeforePasswordsOrWrites() {
        String wrongPassword = "incorrect-database-credential-" + UUID.randomUUID();
        DataSource wrongCredential = new DriverManagerDataSource(
                environment.getRequiredProperty("spring.datasource.url"),
                environment.getRequiredProperty("spring.datasource.username"), wrongPassword);
        assertThatThrownBy(() -> new DemoAccountProvisioner(wrongCredential, passwords).provision(login -> {
            throw new AssertionError("Database authentication must succeed before password entry");
        })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class)
                .hasMessage("Database authentication failed. Check DB_USER and DB_PASSWORD for the approved local database.")
                .hasNoCause();
        assertThat(new JdbcTemplate(dataSource).queryForObject(
                "SELECT COUNT(*) FROM accounts WHERE login_name IN ('maya.demo','tomas.demo','lena.demo','kwame.demo','officer.demo')",
                Integer.class)).isZero();
    }

    @Test
    void v38ChecksumMismatchIsRejectedBeforePasswordsOrWrites() {
        DataSource target = migrationFixture("38");
        JdbcTemplate jdbc = new JdbcTemplate(target);
        jdbc.update("UPDATE flyway_schema_history SET checksum = checksum + 1 WHERE version = '38'");
        assertThatThrownBy(() -> new DemoAccountProvisioner(target, passwords).provision(login -> {
            throw new AssertionError("Checksum mismatch must fail before password entry");
        })).isInstanceOf(DemoAccountProvisioner.ProvisioningException.class)
                .hasMessage("Apply and verify migrations through at least V30 separately before provisioning.");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM astronauts", Integer.class)).isZero();
    }

    private DataSource migrationFixture(String version) {
        String url = environment.getRequiredProperty("spring.datasource.url");
        String user = environment.getRequiredProperty("spring.datasource.username");
        String password = environment.getRequiredProperty("spring.datasource.password");
        String name = "provisioning_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(url, user, password).defaultSchema(name).schemas(name)
                .locations("classpath:db/migration").target(version).cleanDisabled(true).load().migrate();
        return new DriverManagerDataSource(url + (url.contains("?") ? "&" : "?") + "currentSchema=" + name,
                user, password);
    }

    private void rollback(Runnable action) {
        new TransactionTemplate(new DataSourceTransactionManager(dataSource)).executeWithoutResult(status -> {
            try {
                action.run();
            } finally {
                status.setRollbackOnly();
            }
        });
    }
}
