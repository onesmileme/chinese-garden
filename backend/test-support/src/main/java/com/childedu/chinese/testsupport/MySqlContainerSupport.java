package com.childedu.chinese.testsupport;

import org.testcontainers.containers.MySQLContainer;

/** 单例 MySQL 容器：整个测试套件复用同一实例以加速。 */
public final class MySqlContainerSupport {

  private static final MySQLContainer<?> CONTAINER =
      new MySQLContainer<>("mysql:8.0")
          .withDatabaseName("childedu")
          .withUsername("childedu")
          .withPassword("childedu")
          .withReuse(true);

  static {
    CONTAINER.start();
  }

  private MySqlContainerSupport() {}

  public static String jdbcUrl() {
    return CONTAINER.getJdbcUrl();
  }

  public static String username() {
    return CONTAINER.getUsername();
  }

  public static String password() {
    return CONTAINER.getPassword();
  }
}
