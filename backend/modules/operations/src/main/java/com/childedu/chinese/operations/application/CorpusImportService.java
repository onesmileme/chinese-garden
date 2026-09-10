package com.childedu.chinese.operations.application;

import com.childedu.chinese.content.domain.Character;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.Poem;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.springframework.transaction.support.TransactionTemplate;

public class CorpusImportService {

  private final ContentCatalogRepository repository;
  private final ObjectMapper objectMapper;
  private final TransactionTemplate transactionTemplate;

  public CorpusImportService(
      ContentCatalogRepository repository,
      ObjectMapper objectMapper,
      TransactionTemplate transactionTemplate) {
    this.repository = repository;
    this.objectMapper = objectMapper;
    this.transactionTemplate = transactionTemplate;
  }

  public int importIfEmpty(Corpus corpus, String actor, Instant now) {
    Integer imported =
        transactionTemplate.execute(
            status -> {
              repository.lockForInitialImport();
              if (!repository.isEmpty()) {
                return 0;
              }

              corpus.characters().forEach(character -> importCharacter(character, actor, now));
              corpus.poems().forEach(poem -> importPoem(poem, actor, now));
              corpus.idioms().forEach(idiom -> importIdiom(idiom, actor, now));
              return corpus.characters().size() + corpus.poems().size() + corpus.idioms().size();
            });
    return imported == null ? 0 : imported;
  }

  private void importCharacter(Character character, String actor, Instant now) {
    repository.importRevision(
        character.id(),
        "CHARACTER",
        character.status(),
        character.revision(),
        character.level(),
        character.difficulty(),
        character.promotionRequired(),
        character.tags(),
        toJson(
            new CharacterPayload(
                character.ch(),
                character.pinyin(),
                character.imageId(),
                character.theme(),
                character.strokes())),
        actor,
        now);
  }

  private void importPoem(Poem poem, String actor, Instant now) {
    repository.importRevision(
        poem.id(),
        "POEM",
        poem.status(),
        poem.revision(),
        poem.level(),
        poem.difficulty(),
        poem.promotionRequired(),
        poem.tags(),
        toJson(new PoemPayload(poem.title(), poem.author(), poem.lines(), poem.charRefs())),
        actor,
        now);
  }

  private void importIdiom(Idiom idiom, String actor, Instant now) {
    repository.importRevision(
        idiom.id(),
        "IDIOM",
        idiom.status(),
        idiom.revision(),
        idiom.level(),
        idiom.difficulty(),
        idiom.promotionRequired(),
        idiom.tags(),
        toJson(
            new IdiomPayload(
                idiom.text(), idiom.meaning(), idiom.headPinyin(), idiom.tailPinyin())),
        actor,
        now);
  }

  private String toJson(Object payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("cannot serialize corpus item payload", e);
    }
  }

  private record CharacterPayload(
      @JsonProperty("char") String ch,
      String pinyin,
      String imageId,
      String theme,
      int strokes) {}

  private record PoemPayload(
      String title, String author, java.util.List<String> lines, java.util.List<String> charRefs) {}

  private record IdiomPayload(
      String text, String meaning, String headPinyin, String tailPinyin) {}
}
