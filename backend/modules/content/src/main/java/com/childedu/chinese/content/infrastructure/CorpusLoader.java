package com.childedu.chinese.content.infrastructure;

import com.childedu.chinese.content.domain.Character;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.domain.Idiom;
import com.childedu.chinese.content.domain.Poem;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.List;

/** 从 frontend/content/corpus 读取中文语料（与 TS 端同一批文件）。 */
public class CorpusLoader {

  private static final String REQUIRED_VERSION = "corpus-v5";

  private final Path contentRoot; // 指向 frontend/content
  // 语料随 content-schema 演进会新增可选字段（如诗词 dynasty/translation/appreciation、
  // 成语 origin/example/synonyms 等）；后端判题只消费其中的判题必需字段，
  // 因此忽略未知字段以保持前后端向后兼容、避免因新增展示字段导致加载失败。
  private final ObjectMapper mapper =
      new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

  public CorpusLoader(Path contentRoot) {
    this.contentRoot = contentRoot;
  }

  public Corpus load() {
    List<Character> characters = readCharacters();
    List<Poem> poems = readPoems();
    List<Idiom> idioms = readIdioms();
    return new Corpus(characters, poems, idioms);
  }

  private List<Character> readCharacters() {
    try {
      CharacterBank bank =
          mapper.readValue(
              contentRoot.resolve("corpus").resolve("character-bank.json").toFile(),
              CharacterBank.class);
      requireCurrentVersion(bank.version(), "character-bank.json");
      return bank.characters();
    } catch (IOException e) {
      throw new UncheckedIOException("cannot read character-bank.json", e);
    }
  }

  private List<Poem> readPoems() {
    try {
      PoemBank bank =
          mapper.readValue(
              contentRoot.resolve("corpus").resolve("poem-bank.json").toFile(), PoemBank.class);
      requireCurrentVersion(bank.version(), "poem-bank.json");
      return bank.poems();
    } catch (IOException e) {
      throw new UncheckedIOException("cannot read poem-bank.json", e);
    }
  }

  private List<Idiom> readIdioms() {
    try {
      IdiomBank bank =
          mapper.readValue(
              contentRoot.resolve("corpus").resolve("idiom-bank.json").toFile(),
              IdiomBank.class);
      requireCurrentVersion(bank.version(), "idiom-bank.json");
      return bank.idioms();
    } catch (IOException e) {
      throw new UncheckedIOException("cannot read idiom-bank.json", e);
    }
  }

  private void requireCurrentVersion(String version, String fileName) {
    if (!REQUIRED_VERSION.equals(version)) {
      throw new IllegalStateException(
          fileName + " must declare version " + REQUIRED_VERSION + ", but was " + version);
    }
  }

  private record CharacterBank(String version, List<Character> characters) {}

  private record PoemBank(String version, List<Poem> poems) {}

  private record IdiomBank(String version, List<Idiom> idioms) {}
}
