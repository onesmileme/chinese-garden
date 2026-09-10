package com.childedu.chinese.app;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

class ArchitectureTests {

  static final JavaClasses IMPORTED =
      new ClassFileImporter()
          .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
          .importPackages("com.childedu.chinese");

  @Test
  void domainDoesNotDependOnInfrastructure() {
    noClasses()
        .that()
        .resideInAPackage("..domain..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..infrastructure..", "..api..")
        .check(IMPORTED);
  }

  @Test
  void apiDoesNotDependOnInfrastructureDirectly() {
    noClasses()
        .that()
        .resideInAPackage("..api..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage("..infrastructure..")
        .check(IMPORTED);
  }
}
