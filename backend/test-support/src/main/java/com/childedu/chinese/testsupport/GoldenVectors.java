package com.childedu.chinese.testsupport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 定位并读取 child-chinese/frontend/content 下的规则与黄金向量（TS/Java 共享同一批文件）。
 * 与算术版差异：内容根是 frontend/content（本仓自包含），不是 child_edu/content 跨仓共享目录。
 */
public final class GoldenVectors {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private GoldenVectors() {}

  /** 从当前工作目录向上寻找 child-chinese 的 frontend/content 目录。 */
  public static Path contentRoot() {
    Path dir = Paths.get("").toAbsolutePath();
    while (dir != null) {
      Path selfContained = dir.resolve("frontend").resolve("content");
      if (isContentDir(selfContained)) {
        return selfContained;
      }
      Path nested =
          dir.resolve("child_edu").resolve("child-chinese").resolve("frontend").resolve("content");
      if (isContentDir(nested)) {
        return nested;
      }
      dir = dir.getParent();
    }
    throw new IllegalStateException("child-chinese frontend/content not found from working dir");
  }

  private static boolean isContentDir(Path candidate) {
    return Files.isDirectory(candidate) && Files.isDirectory(candidate.resolve("test-vectors"));
  }

  public static JsonNode readVector(String fileName) {
    try {
      return MAPPER.readTree(contentRoot().resolve("test-vectors").resolve(fileName).toFile());
    } catch (IOException e) {
      throw new UncheckedIOException("cannot read vector: " + fileName, e);
    }
  }
}
