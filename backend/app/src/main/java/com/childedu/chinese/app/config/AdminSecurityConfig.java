package com.childedu.chinese.app.config;

import com.childedu.chinese.content.domain.ContentValidator;
import com.childedu.chinese.operations.application.AuditLog;
import com.childedu.chinese.operations.application.AdminPrincipalRepository;
import com.childedu.chinese.operations.application.ContentAdminService;
import com.childedu.chinese.operations.application.ContentAuthoringService;
import com.childedu.chinese.operations.application.ContentCatalogRepository;
import com.childedu.chinese.operations.application.ContentReleaseAdminRepository;
import com.childedu.chinese.operations.infrastructure.AdminAuthFilter;
import com.childedu.chinese.operations.infrastructure.BootstrapAdminPrincipalRepository;
import com.childedu.chinese.operations.infrastructure.JdbcAdminPrincipalRepository;
import com.childedu.chinese.operations.infrastructure.JdbcAuditLog;
import com.childedu.chinese.operations.infrastructure.JdbcContentReleaseAdminRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** 发布管理的唯一 Spring 装配点，组合数据库主体与可选的本地 bootstrap token。 */
@Configuration
public class AdminSecurityConfig {

  @Bean
  public ContentReleaseAdminRepository contentReleaseAdminRepository(
      JdbcTemplate jdbc, ObjectMapper objectMapper) {
    return new JdbcContentReleaseAdminRepository(jdbc, objectMapper);
  }

  @Bean
  public AdminPrincipalRepository adminPrincipalRepository(
      JdbcTemplate jdbc,
      ObjectMapper objectMapper,
      Environment environment,
      @Value("${childedu.admin.token:}") String bootstrapToken) {
    AdminPrincipalRepository databasePrincipals =
        new JdbcAdminPrincipalRepository(jdbc, objectMapper);
    if (environment.acceptsProfiles(Profiles.of("prod"))) {
      return databasePrincipals;
    }
    return new BootstrapAdminPrincipalRepository(databasePrincipals, bootstrapToken);
  }

  @Bean
  public Clock contentAdminClock() {
    return Clock.systemUTC();
  }

  @Bean
  public AuditLog contentAdminAuditLog(JdbcTemplate jdbc) {
    return new JdbcAuditLog(jdbc);
  }

  @Bean
  public ContentAdminService contentAdminService(
      ContentReleaseAdminRepository repository,
      ContentCatalogRepository catalog,
      AuditLog audit,
      Clock contentAdminClock,
      TransactionTemplate transactionTemplate) {
    return new ContentAdminService(
        repository, catalog, audit, contentAdminClock, transactionTemplate);
  }

  @Bean
  public ContentAuthoringService contentAuthoringService(
      ContentCatalogRepository repository,
      AuditLog audit,
      ObjectMapper objectMapper,
      ContentValidator contentValidator,
      TransactionTemplate transactionTemplate,
      Clock contentAdminClock) {
    return new ContentAuthoringService(
        repository,
        audit,
        objectMapper,
        contentValidator,
        transactionTemplate,
        contentAdminClock);
  }

  @Bean
  public FilterRegistrationBean<AdminAuthFilter> adminAuthFilter(
      AdminPrincipalRepository principals,
      @Value("${childedu.admin.allowed-ips:}") String allowedIps) {
    FilterRegistrationBean<AdminAuthFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(new AdminAuthFilter(principals, allowedIps));
    registration.addUrlPatterns("/*");
    registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
    return registration;
  }
}
