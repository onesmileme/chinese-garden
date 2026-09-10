package com.childedu.chinese.identity.application;

@FunctionalInterface
public interface IdGenerator {
  String next();
}
