package com.childedu.chinese.app.config;

import com.childedu.chinese.identity.application.IdGenerator;
import com.childedu.chinese.identity.application.IdentityRepository;
import com.childedu.chinese.identity.application.IdentityService;
import com.childedu.chinese.identity.application.RefreshSessionRepository;
import com.childedu.chinese.identity.application.TokenService;
import com.childedu.chinese.identity.domain.Platform;
import com.childedu.chinese.identity.domain.PlatformGateway;
import com.childedu.chinese.identity.infrastructure.ClientAuthFilter;
import com.childedu.chinese.identity.infrastructure.DouyinPlatformGateway;
import com.childedu.chinese.identity.infrastructure.JdbcIdentityRepository;
import com.childedu.chinese.identity.infrastructure.JdbcRefreshSessionRepository;
import com.childedu.chinese.identity.infrastructure.WeappPlatformGateway;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ClientSecurityConfig {

  @Bean
  public IdentityRepository identityRepository(
      JdbcTemplate jdbc, TransactionTemplate transactions) {
    return new JdbcIdentityRepository(jdbc, transactions);
  }

  @Bean
  public RefreshSessionRepository refreshSessionRepository(
      JdbcTemplate jdbc, TransactionTemplate transactions) {
    return new JdbcRefreshSessionRepository(jdbc, transactions);
  }

  @Bean
  public TokenService tokenService(
      @Value("${childedu.auth.jwt-secret-base64}") String encodedSecret, Clock clock) {
    byte[] secret;
    try {
      secret = Base64.getDecoder().decode(encodedSecret);
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("JWT secret must be valid Base64", error);
    }
    if (secret.length < 32) {
      throw new IllegalArgumentException("JWT secret must contain at least 32 bytes");
    }
    return new TokenService(secret, clock::instant);
  }

  @Bean
  public IdGenerator identityIdGenerator() {
    return () -> UUID.randomUUID().toString().replace("-", "").substring(0, 26);
  }

  @Bean
  public IdentityService identityService(
      IdentityRepository identities,
      RefreshSessionRepository refreshSessions,
      TokenService tokens,
      IdGenerator identityIdGenerator,
      Clock clock,
      @Value("${childedu.platform.wechat.base-url:https://api.weixin.qq.com/}") String wechatUrl,
      @Value("${childedu.platform.wechat.app-id:}") String wechatAppId,
      @Value("${childedu.platform.wechat.secret:}") String wechatSecret,
      @Value("${childedu.platform.douyin.base-url:https://developer.toutiao.com/}")
          String douyinUrl,
      @Value("${childedu.platform.douyin.app-id:}") String douyinAppId,
      @Value("${childedu.platform.douyin.secret:}") String douyinSecret) {
    Map<Platform, PlatformGateway> gateways = new EnumMap<>(Platform.class);
    if (!wechatAppId.isBlank() && !wechatSecret.isBlank()) {
      gateways.put(
          Platform.WECHAT, new WeappPlatformGateway(wechatUrl, wechatAppId, wechatSecret));
    }
    if (!douyinAppId.isBlank() && !douyinSecret.isBlank()) {
      gateways.put(
          Platform.DOUYIN,
          new DouyinPlatformGateway(douyinUrl, douyinAppId, douyinSecret));
    }
    if (gateways.isEmpty()) {
      throw new IllegalStateException(
          "at least one login platform must be configured");
    }
    return new IdentityService(
        gateways, identities, refreshSessions, tokens, identityIdGenerator, clock);
  }

  @Bean
  public FilterRegistrationBean<ClientAuthFilter> clientAuthFilter(
      TokenService tokens, IdentityRepository identities) {
    FilterRegistrationBean<ClientAuthFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(new ClientAuthFilter(tokens, identities));
    registration.addUrlPatterns("/*");
    registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
    return registration;
  }

  @Bean
  public WebMvcConfigurer clientCorsConfigurer(
      @Value("${childedu.auth.allowed-origins:}") String configuredOrigins) {
    List<String> allowedOrigins =
        Arrays.stream(configuredOrigins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toList();
    return new WebMvcConfigurer() {
      @Override
      public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.isEmpty()) {
          return;
        }
        String[] origins = allowedOrigins.toArray(String[]::new);
        registry
            .addMapping("/v1/auth/**")
            .allowedOrigins(origins)
            .allowedMethods("POST", "OPTIONS")
            .allowedHeaders("Content-Type");
        registry
            .addMapping("/v1/content/**")
            .allowedOrigins(origins)
            .allowedMethods("GET", "OPTIONS")
            .allowedHeaders("Authorization", ClientAuthFilter.CHILD_HEADER);
      }
    };
  }
}
