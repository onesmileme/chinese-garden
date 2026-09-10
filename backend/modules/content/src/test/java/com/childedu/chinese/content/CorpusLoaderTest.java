package com.childedu.chinese.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.childedu.chinese.content.domain.ContentLevel;
import com.childedu.chinese.content.domain.ContentStatus;
import com.childedu.chinese.content.domain.Corpus;
import com.childedu.chinese.content.infrastructure.CorpusLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CorpusLoaderTest {

  @Test
  void loadsCharactersAndPoemsFromCorpusJson(@TempDir Path dir) throws Exception {
    Path corpus = Files.createDirectories(dir.resolve("corpus"));
    Files.writeString(
        corpus.resolve("character-bank.json"),
        """
        {"version":"corpus-v5","characters":[
          {"id":"hz-ma-妈","char":"妈","pinyin":"mā","meaning":"妈妈 / mother","imageId":"img-ma",
           "theme":"family","strokes":6,"difficulty":1,"level":1,"promotionRequired":true,
           "status":"ACTIVE","tags":[],"revision":1,"words":["妈妈","姑妈"]},
          {"id":"hz-yue-月","char":"月","pinyin":"yuè","meaning":"月亮 / moon","imageId":"img-yue",
           "theme":"nature","strokes":4,"difficulty":1,"level":1,"promotionRequired":true,
           "status":"ACTIVE","tags":[],"revision":1,"words":["月亮","明月"]},
          {"id":"hz-guang-光","char":"光","pinyin":"guāng","meaning":"光 / light","imageId":"img-guang",
           "theme":"nature","strokes":6,"difficulty":2,"level":2,"promotionRequired":true,
           "status":"ACTIVE","tags":[],"revision":1,"words":["月光","阳光"]}
        ]}
        """);
    Files.writeString(
        corpus.resolve("poem-bank.json"),
        """
        {"version":"corpus-v5","poems":[
          {"id":"sc-jingyesi","title":"静夜思","author":"李白",
           "lines":["床前明月光","疑是地上霜","举头望明月","低头思故乡"],
           "charRefs":["hz-yue-月","hz-guang-光"],"difficulty":2,"level":2,
           "promotionRequired":true,"status":"ACTIVE","tags":[],"revision":1}
        ]}
        """);
    Files.writeString(
        corpus.resolve("idiom-bank.json"),
        """
        {"version":"corpus-v5","idioms":[
          {"id":"cy-madaochenggong","text":"马到成功","meaning":"事情顺利，很快取得成功",
           "headPinyin":"ma","tailPinyin":"gong","difficulty":1,"level":1,
           "promotionRequired":true,"status":"ACTIVE","tags":[],"revision":1}
        ]}
        """);

    Corpus loaded = new CorpusLoader(dir).load();

    assertThat(loaded.character("hz-ma-妈").ch()).isEqualTo("妈");
    assertThat(loaded.character("hz-ma-妈").pinyin()).isEqualTo("mā");
    assertThat(loaded.character("hz-guang-光").theme()).isEqualTo("nature");
    assertThat(loaded.character("hz-yue-月").level()).isEqualTo(1);
    assertThat(loaded.character("hz-yue-月").contentLevel()).isEqualTo(ContentLevel.L1);
    assertThat(loaded.character("hz-yue-月").status()).isEqualTo(ContentStatus.ACTIVE);
    assertThat(loaded.character("hz-yue-月").promotionRequired()).isTrue();
    assertThat(loaded.character("hz-yue-月").revision()).isEqualTo(1);
    assertThat(loaded.character("hz-yue-月").tags()).isEmpty();
    assertThat(loaded.poem("sc-jingyesi").lines()).hasSize(4).first().isEqualTo("床前明月光");
    assertThat(loaded.idiom("cy-madaochenggong").text()).isEqualTo("马到成功");
    assertThatThrownBy(() -> loaded.character("hz-none"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> loaded.idiom("cy-none"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsLoadingWhenAnyBankIsNotCorpusV5(@TempDir Path dir) throws Exception {
    Path corpus = Files.createDirectories(dir.resolve("corpus"));
    Map<String, String> validBanks =
        Map.of(
            "character-bank.json", """
                {"version":"corpus-v5","characters":[]}
                """,
            "poem-bank.json", """
                {"version":"corpus-v5","poems":[]}
                """,
            "idiom-bank.json", """
                {"version":"corpus-v5","idioms":[]}
                """);

    for (Map.Entry<String, String> bank : validBanks.entrySet()) {
      validBanks.forEach(
          (fileName, json) -> {
            try {
              Files.writeString(corpus.resolve(fileName), json);
            } catch (java.io.IOException e) {
              throw new java.io.UncheckedIOException(e);
            }
          });
      Files.writeString(
          corpus.resolve(bank.getKey()), bank.getValue().replace("corpus-v5", "corpus-v4"));

      assertThatThrownBy(() -> new CorpusLoader(dir).load())
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining(bank.getKey())
          .hasMessageContaining("corpus-v5");
    }
  }
}
