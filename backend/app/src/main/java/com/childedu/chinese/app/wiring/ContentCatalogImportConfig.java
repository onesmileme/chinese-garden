package com.childedu.chinese.app.wiring;

import com.childedu.chinese.content.infrastructure.CorpusLoader;
import com.childedu.chinese.operations.application.CorpusImportService;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ContentCatalogImportConfig {

  @Bean
  @ConditionalOnProperty(
      name = "childedu.content.import-on-start",
      havingValue = "true")
  public ApplicationRunner contentCatalogImportRunner(
      CorpusLoader loader,
      CorpusImportService importService,
      @Value("${childedu.content.import-actor}") String actor) {
    return args -> importService.importIfEmpty(loader.load(), actor, Instant.now());
  }
}
