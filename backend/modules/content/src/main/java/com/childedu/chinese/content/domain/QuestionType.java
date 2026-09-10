package com.childedu.chinese.content.domain;

/** 题型枚举（对齐 content-schema/question.ts::QuestionType；仅诗词/成语，去 K12 识字/拼音）。 */
public enum QuestionType {
  POEM_FILL,
  POEM_MATCH_NEXT,
  IDIOM_CHAIN,
  IDIOM_MEANING;
}
