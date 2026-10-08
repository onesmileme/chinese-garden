package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.childedu.chinese.content.domain.PoemIdentity;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class PoemIdentityTest {

  private static final int EXPECTED_VECTOR_COUNT = 8;
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void pinsProductionRemovalTablesToTheSharedUnicode15Contract() throws Exception {
    JsonNode contract = MAPPER.readTree(Files.readString(findVectors()));

    assertThat(PoemIdentity.unicodeVersion())
        .isEqualTo(contract.path("unicodeVersion").asText());
    assertThat(PoemIdentity.whiteSpaceRanges())
        .containsExactlyElementsOf(
            MAPPER.convertValue(
                contract.path("whiteSpaceRanges"), new TypeReference<List<String>>() {}));
    assertThat(PoemIdentity.punctuationRanges())
        .containsExactlyElementsOf(
            MAPPER.convertValue(
                contract.path("punctuationRanges"), new TypeReference<List<String>>() {}));
  }

  @Test
  void matchesSharedTypeScriptGoldenVectors() throws Exception {
    JsonNode contract = MAPPER.readTree(Files.readString(findVectors()));
    assertThat(contract.isObject()).isTrue();
    assertThat(contract.path("ruleVersion").isTextual()).isTrue();
    assertThat(contract.path("ruleVersion").asText()).isEqualTo("poem-identity-v1");
    assertThat(contract.path("unicodeVersion").isTextual()).isTrue();
    assertThat(contract.path("unicodeVersion").asText()).isEqualTo("15.0.0");

    JsonNode vectors = contract.path("vectors");
    assertThat(vectors.isArray()).isTrue();
    assertThat(vectors.isEmpty()).isFalse();
    assertThat(vectors.size()).isEqualTo(EXPECTED_VECTOR_COUNT);
    for (JsonNode vector : vectors) {
      assertTextField(vector, "name");
      assertTextField(vector, "author");
      assertTextField(vector, "normalizedAuthor");
      assertTextField(vector, "normalizedBody");
      assertTextField(vector, "identity");
      assertThat(vector.path("lines").isArray())
          .as("%s lines is an array", vector.path("name").asText())
          .isTrue();
      assertThat(vector.path("lines").isEmpty())
          .as("%s lines is not empty", vector.path("name").asText())
          .isFalse();
      for (JsonNode line : vector.path("lines")) {
        assertThat(line.isTextual())
            .as("%s line is text", vector.path("name").asText())
            .isTrue();
      }
    }

    int assertedVectorCount = 0;
    for (JsonNode vector : vectors) {
      List<String> lines =
          MAPPER.convertValue(vector.path("lines"), new TypeReference<List<String>>() {});

      assertThat(PoemIdentity.normalize(vector.path("author").asText()))
          .as("%s normalized author", vector.path("name").asText())
          .isEqualTo(vector.path("normalizedAuthor").asText());
      assertThat(PoemIdentity.normalize(String.join("", lines)))
          .as("%s normalized body", vector.path("name").asText())
          .isEqualTo(vector.path("normalizedBody").asText());
      assertThat(PoemIdentity.of(vector.path("author").asText(), lines))
          .as("%s identity", vector.path("name").asText())
          .isEqualTo(vector.path("identity").asText());
      assertedVectorCount++;
    }
    assertThat(assertedVectorCount)
        .as("golden vectors exercised")
        .isEqualTo(EXPECTED_VECTOR_COUNT);
  }

  private static void assertTextField(JsonNode vector, String field) {
    assertThat(vector.path(field).isTextual())
        .as("%s %s is text", vector.path("name").asText(), field)
        .isTrue();
  }

  private static Path findVectors() {
    for (Path root = Path.of("").toAbsolutePath(); root != null; root = root.getParent()) {
      Path candidate = root.resolve("frontend/content/test-vectors/poem-identity-v1.json");
      if (Files.isRegularFile(candidate)) {
        return candidate;
      }
    }
    throw new IllegalStateException("poem identity vectors not found");
  }
}
