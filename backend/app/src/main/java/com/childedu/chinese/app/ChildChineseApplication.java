package com.childedu.chinese.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.modulith.Modulithic;

@Modulithic(systemName = "child-chinese-backend")
@SpringBootApplication(scanBasePackages = "com.childedu.chinese")
public class ChildChineseApplication {
  public static void main(String[] args) {
    SpringApplication.run(ChildChineseApplication.class, args);
  }
}
