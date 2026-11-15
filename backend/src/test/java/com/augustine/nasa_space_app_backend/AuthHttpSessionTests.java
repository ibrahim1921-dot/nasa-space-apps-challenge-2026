package com.augustine.nasa_space_app_backend;

import com.augustine.nasa_space_app_backend.entity.Astronaut;
import com.augustine.nasa_space_app_backend.entity.Account;
import com.augustine.nasa_space_app_backend.entity.AccountRole;
import com.augustine.nasa_space_app_backend.repository.AstronautRepository;
import com.augustine.nasa_space_app_backend.repository.AccountRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Real servlet-container verification; cookies are transmitted manually on loopback test HTTP. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.servlet.session.cookie.secure=true")
class AuthHttpSessionTests extends PostgreSqlIntegrationTest {
    @Value("${local.server.port}") private int port;
    @Autowired private ObjectMapper json;
    @Autowired private AstronautRepository astronauts;
    @Autowired private AccountRepository accounts;
    @Autowired private PasswordEncoder passwords;

    @Test
    void preProvisionedLoginCookieRotationPersistenceAndLogoutOverRealHttp() throws Exception {
        String suffix = UUID.randomUUID().toString();
        Astronaut astronaut = astronauts.saveAndFlush(new Astronaut("http-" + suffix, "HTTP Session Test"));
        String login = "http." + suffix;
        String password = "HTTP session test passphrase!";
        accounts.saveAndFlush(new Account(login, passwords.encode(password), AccountRole.ASTRONAUT, astronaut.getId()));

        HttpClient client = HttpClient.newHttpClient();
            HttpResponse<String> initial = send(client, "GET", "/api/auth/csrf", null, null, null);
            assertThat(initial.statusCode()).isEqualTo(200);
            String setCookie = initial.headers().firstValue("Set-Cookie").orElseThrow();
            // Boolean assertions keep session/CSRF values out of failure reports.
            assertThat(setCookie.contains("HttpOnly")).isTrue();
            assertThat(setCookie.contains("Secure")).isTrue();
            assertThat(setCookie.contains("SameSite=Lax")).isTrue();
            String oldCookie = setCookie.split(";", 2)[0];
            String csrf = json.readTree(initial.body()).get("token").asText();

            HttpResponse<String> authenticated = send(client, "POST", "/api/auth/login", oldCookie, csrf,
                    Map.of("loginName", login, "password", password));
            assertThat(authenticated.statusCode()).isEqualTo(200);
            assertThat(json.readTree(authenticated.body()).get("role").asText()).isEqualTo("ASTRONAUT");
            assertThat(authenticated.body().contains(password)
                    || authenticated.body().contains("passwordHash")).isFalse();
            String cookie = authenticated.headers().firstValue("Set-Cookie").orElseThrow().split(";", 2)[0];
            assertThat(cookie.equals(oldCookie)).isFalse();
            assertThat(send(client, "GET", "/api/auth/me", oldCookie, null, null).statusCode()).isEqualTo(401);
            assertThat(send(client, "GET", "/api/auth/me", cookie, null, null).statusCode()).isEqualTo(200);
            assertThat(send(client, "POST", "/api/auth/logout", cookie, csrf, null).statusCode()).isEqualTo(403);

            HttpResponse<String> refreshed = send(client, "GET", "/api/auth/csrf", cookie, null, null);
            String newCsrf = json.readTree(refreshed.body()).get("token").asText();
            HttpResponse<String> logout = send(client, "POST", "/api/auth/logout", cookie, newCsrf, null);
            assertThat(logout.statusCode()).isEqualTo(204);
            assertThat(logout.headers().allValues("Set-Cookie").stream()
                    .flatMap(value -> java.net.HttpCookie.parse(value).stream())
                    .anyMatch(value -> value.getName().equals("JSESSIONID") && value.getMaxAge() == 0))
                    .isTrue();
            assertThat(send(client, "GET", "/api/auth/me", cookie, null, null).statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> send(HttpClient client, String method, String path,
                                      String cookie, String csrf, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).timeout(Duration.ofSeconds(10));
        if (cookie != null) builder.header("Cookie", cookie);
        if (csrf != null) builder.header("X-CSRF-TOKEN", csrf);
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
