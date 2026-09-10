package com.childedu.chinese.app;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ModularityTests {

  static final ApplicationModules MODULES = ApplicationModules.of(ChildChineseApplication.class);

  @Test
  void verifiesModuleBoundaries() {
    MODULES.verify(); // 违反模块边界（跨模块访问 internal 包）时抛异常
  }
}
