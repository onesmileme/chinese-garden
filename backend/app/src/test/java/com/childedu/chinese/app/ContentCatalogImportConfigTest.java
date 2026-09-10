package com.childedu.chinese.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.childedu.chinese.app.wiring.ContentCatalogImportConfig;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.infrastructure.CorpusLoader;
import com.childedu.chinese.operations.application.CorpusImportService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ContentCatalogImportConfigTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner().withUserConfiguration(ContentCatalogImportConfig.class);

  @Test
  void doesNotCreateImportRunnerByDefault() {
    contextRunner.run(
        context ->
            assertThat(context.getBeansOfType(ApplicationRunner.class)).isEmpty());
  }

  @Test
  void importsTheConfiguredCorpusOnceWhenExplicitlyEnabled() {
    Corpus corpus = new Corpus(List.of(), List.of(), List.of());
    CorpusLoader loader = mock(CorpusLoader.class);
    CorpusImportService service = mock(CorpusImportService.class);
    when(loader.load()).thenReturn(corpus);

    contextRunner
        .withPropertyValues(
            "childedu.content.import-on-start=true",
            "childedu.content.import-actor=corpus-v5-migration")
        .withBean(CorpusLoader.class, () -> loader)
        .withBean(CorpusImportService.class, () -> service)
        .run(
            context -> {
              assertThat(context.getBeansOfType(ApplicationRunner.class)).hasSize(1);
              context.getBean(ApplicationRunner.class).run(mock(ApplicationArguments.class));
            });

    verify(loader, times(1)).load();
    verify(service, times(1))
        .importIfEmpty(eq(corpus), eq("corpus-v5-migration"), any(Instant.class));
  }
}
