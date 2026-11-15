package com.augustine.nasa_space_app_backend.security;

import com.augustine.nasa_space_app_backend.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.CompositeLogoutHandler;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.net.URI;
import java.util.List;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    AuthenticationManager authenticationManager(AuthService auth) { return new ProviderManager(auth); }

    @Bean
    SecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }

    @Bean
    HttpSessionCsrfTokenRepository csrfTokenRepository() { return new HttpSessionCsrfTokenRepository(); }

    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy(HttpSessionCsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(List.of(new ChangeSessionIdAuthenticationStrategy(),
                new CsrfAuthenticationStrategy(csrf)));
    }

    @Bean
    LogoutHandler sessionLogoutHandler(SecurityContextRepository contexts, HttpSessionCsrfTokenRepository csrf) {
        SecurityContextLogoutHandler security = new SecurityContextLogoutHandler();
        security.setSecurityContextRepository(contexts);
        return new CompositeLogoutHandler(new CsrfLogoutHandler(csrf), security,
                new CookieClearingLogoutHandler("JSESSIONID"));
    }

    @Bean
    UrlBasedCorsConfigurationSource corsConfigurationSource(
            @Value("${astrohealth.security.allowed-origins}") List<String> origins) {
        for (String origin : origins) {
            URI uri = URI.create(origin);
            if (origin.contains("*") || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty())
                    || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) {
                throw new IllegalArgumentException("CORS requires explicit HTTP(S) origins without paths.");
            }
        }
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins);
        cors.setAllowCredentials(true);
        cors.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
        cors.setExposedHeaders(List.of("Retry-After"));
        cors.setMaxAge(600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AuthService auth, AttemptLimiter limiter,
                                           SecurityContextRepository contexts,
                                           HttpSessionCsrfTokenRepository csrf, LogoutHandler logout,
                                           UrlBasedCorsConfigurationSource cors) throws Exception {
        http.cors(value -> value.configurationSource(cors))
                .csrf(value -> value.csrfTokenRepository(csrf))
                .securityContext(value -> value.securityContextRepository(contexts).requireExplicitSave(true))
                .sessionManagement(value -> value.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))
                .requestCache(value -> value.disable())
                .formLogin(value -> value.disable())
                .httpBasic(value -> value.disable())
                .logout(value -> value.disable()) // AuthController delegates to standard logout handlers.
                .exceptionHandling(value -> value
                        .authenticationEntryPoint((request, response, exception) -> SecurityErrors.write(response, 401))
                        .accessDeniedHandler((request, response, exception) -> SecurityErrors.write(response, 403)))
                .authorizeHttpRequests(value -> value
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/me").hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/crew/me").hasRole("ASTRONAUT")
                        .requestMatchers(HttpMethod.GET, "/api/crew/*/baselines", "/api/crew/*/baselines/selection", "/api/crew/*/baselines/versions")
                        .hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/crew/*/baselines", "/api/crew/*/baselines/*/approve")
                        .hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/crew", "/api/crew/*", "/api/crew/by-code/*")
                        .hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/crew/*/archive", "/api/crew/*/reactivate")
                        .hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/simulation/captures", "/api/simulation/captures/*/close",
                                "/api/simulation/captures/*/observations")
                        .hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/simulation/captures/*").hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/crew/*/monitoring-rules/selection").hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/monitoring-rules").hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/monitoring-rules", "/api/monitoring-rules/*/activation").hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/alerts/me").hasRole("ASTRONAUT")
                        .requestMatchers(HttpMethod.GET, "/api/alerts").hasRole("NASA_OFFICER")
                        .requestMatchers(HttpMethod.GET, "/api/alerts/*").hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/alerts/*/acknowledge").hasAnyRole("ASTRONAUT", "NASA_OFFICER")
                        .requestMatchers(HttpMethod.POST, "/api/alerts/*/resolve").hasRole("NASA_OFFICER")
                        .anyRequest().denyAll())
                .addFilterBefore(new AccountStatusFilter(auth, logout), AuthorizationFilter.class)
                .addFilterAfter(new AttemptProtectionFilter(limiter), CsrfFilter.class);
        return http.build();
    }
}
