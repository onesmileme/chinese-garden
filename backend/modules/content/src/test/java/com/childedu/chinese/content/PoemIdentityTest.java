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

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  void matchesSharedTypeScriptGoldenVectors() throws Exception {
    JsonNode vectors = MAPPER.readTree(Files.readString(findVectors()));
    for (JsonNode vector : vectors.path("vectors")) {
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
    }
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
