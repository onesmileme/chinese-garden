package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.app.config.AdminSecurityConfig;
import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.infrastructure.BootstrapAdminPrincipalRepository;
import com.childedu.chinese.operations.infrastructure.JdbcAdminPrincipalRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;

class AdminSecurityConfigTest {

  private final AdminSecurityConfig config = new AdminSecurityConfig();
  private final JdbcTemplate jdbc = new JdbcTemplate();
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void enablesTheBootstrapTokenOutsideProduction() {
    AdminPrincipalRepository repository =
        config.adminPrincipalRepository(
            jdbc, objectMapper, new MockEnvironment(), "local-token");

    assertThat(repository).isInstanceOf(BootstrapAdminPrincipalRepository.class);
  }

  @Test
  void disablesTheBootstrapTokenInProduction() {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles("prod");

    AdminPrincipalRepository repository =
        config.adminPrincipalRepository(jdbc, objectMapper, environment, "must-not-work");

    assertThat(repository).isInstanceOf(JdbcAdminPrincipalRepository.class);
  }
}
