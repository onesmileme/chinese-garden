package com.childedu.chinese.testsupport;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 定位 app 模块的 Flyway 迁移脚本目录（V1–V6 单一权威源），供各模块的集成测试复用，
 * 避免在每个模块下复制 db/migration 造成版本漂移。
 */
public final class MigrationSupport {

  private MigrationSupport() {}

  /** 从当前工作目录向上寻找 app/src/main/resources/db/migration，返回 Flyway 的 filesystem: location。 */
  public static String location() {
    Path dir = Paths.get("").toAbsolutePath();
    while (dir != null) {
      Path candidate =
          dir.resolve("app").resolve("src").resolve("main").resolve("resources")
              .resolve("db").resolve("migration");
      if (Files.isDirectory(candidate)) {
        return "filesystem:" + candidate;
      }
      dir = dir.getParent();
    }
    throw new IllegalStateException("app db/migration not found from working dir");
  }
}
