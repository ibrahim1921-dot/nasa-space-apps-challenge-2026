package com.augustine.nasa_space_app_backend;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** One disposable database per test JVM; never use DB_URL or the development Docker volume. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.enabled=true",
        "spring.flyway.clean-disabled=true",
        "spring.docker.compose.enabled=false",
        "spring.jpa.show-sql=false",
        // Cached test contexts share one PostgreSQL container. Keep enough slots for
        // concurrent writers and independent Flyway connections without ten idle clients per context.
        "spring.datasource.hikari.maximum-pool-size=4",
        "spring.datasource.hikari.minimum-idle=1",
        "logging.level.org.hibernate.SQL=OFF",
        "logging.level.org.hibernate.orm.jdbc.bind=OFF",
        "logging.level.org.hibernate.orm.jdbc.extract=OFF"
})
abstract class PostgreSqlIntegrationTest {

    // Singleton lifecycle avoids cached Spring contexts retaining a stopped container.
    // Testcontainers' resource reaper removes it when the test JVM exits. No reusable volume.
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17")
            .withDatabaseName("astrohealth_phase1_test")
            .withReuse(false);

    static {
        POSTGRES.start(); // Fail rather than skip/fall back when Docker is unavailable.
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }
}
