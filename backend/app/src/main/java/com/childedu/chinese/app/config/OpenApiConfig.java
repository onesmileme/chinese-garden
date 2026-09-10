package com.childedu.chinese.app.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** springdoc：定义 bearer 安全方案，产出 /v3/api-docs 供前端 api-client 生成类型。 */
@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI childEduOpenApi() {
    return new OpenAPI()
        .info(new Info().title("Child Chinese Backend API").version("v1"))
        .components(
            new io.swagger.v3.oas.models.Components()
                .addSecuritySchemes(
                    "bearer",
                    new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")));
  }
}
