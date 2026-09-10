import {
  asKnowledgePointId,
  type ContentLevel,
  type ContentMetadata,
} from "@cc/content-schema";
import type { Corpus } from "@cc/domain";

const withActiveMetadata = <T extends { difficulty: ContentLevel }>(
  items: T[],
): Array<T & ContentMetadata> =>
  items.map((item) => ({
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  }));

// 古文乐园示例语料：仅诗词与成语，去除 K12（识字/拼音）内容。
export const demoCorpus: Corpus = {
  poems: withActiveMetadata([
    {
      id: asKnowledgePointId("sc-jingyesi"),
      title: "静夜思",
      author: "李白",
      lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
      difficulty: 2,
    },
    {
      id: asKnowledgePointId("sc-yonge"),
      title: "咏鹅",
      author: "骆宾王",
      lines: ["鹅鹅鹅", "曲项向天歌", "白毛浮绿水", "红掌拨清波"],
      difficulty: 2,
    },
    {
      id: asKnowledgePointId("sc-chunxiao"),
      title: "春晓",
      author: "孟浩然",
      lines: ["春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少"],
      difficulty: 3,
    },
    {
      id: asKnowledgePointId("sc-dengguanquelou"),
      title: "登鹳雀楼",
      author: "王之涣",
      lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"],
      difficulty: 4,
    },
    {
      id: asKnowledgePointId("sc-xiangsi"),
      title: "相思",
      author: "王维",
      lines: ["红豆生南国", "春来发几枝", "愿君多采撷", "此物最相思"],
      difficulty: 5,
    },
  ]),
  // 成语取难度 1 的闭合接龙组（每条成语在组内都有后继），保证任意路由到
  // IDIOM_CHAIN 都能生成；难度层次由诗词覆盖（2–5）。
  idioms: withActiveMetadata([
    { id: asKnowledgePointId("cy-yixinyiyi"), text: "一心一意", meaning: "心思专一，没有别的想法", headPinyin: "yi", tailPinyin: "yi", difficulty: 1 },
    { id: asKnowledgePointId("cy-yiqifengfa"), text: "意气风发", meaning: "精神振奋，气概豪迈", headPinyin: "yi", tailPinyin: "fa", difficulty: 1 },
    { id: asKnowledgePointId("cy-fayangguangda"), text: "发扬光大", meaning: "让好的事物得到发展", headPinyin: "fa", tailPinyin: "da", difficulty: 1 },
    { id: asKnowledgePointId("cy-dagonggaocheng"), text: "大功告成", meaning: "重要的事情顺利完成", headPinyin: "da", tailPinyin: "cheng", difficulty: 1 },
    { id: asKnowledgePointId("cy-chengqianshangwan"), text: "成千上万", meaning: "数量非常多", headPinyin: "cheng", tailPinyin: "wan", difficulty: 1 },
    { id: asKnowledgePointId("cy-wanzhongyixin"), text: "万众一心", meaning: "大家团结一心", headPinyin: "wan", tailPinyin: "xin", difficulty: 1 },
    { id: asKnowledgePointId("cy-xinxiangshicheng"), text: "心想事成", meaning: "心里的愿望顺利实现", headPinyin: "xin", tailPinyin: "cheng", difficulty: 1 },
    { id: asKnowledgePointId("cy-madaochenggong"), text: "马到成功", meaning: "事情顺利，很快取得成功", headPinyin: "ma", tailPinyin: "gong", difficulty: 1 },
    { id: asKnowledgePointId("cy-gongshigongban"), text: "公事公办", meaning: "按公事的原则来办", headPinyin: "gong", tailPinyin: "ban", difficulty: 1 },
    { id: asKnowledgePointId("cy-banxinbanyi"), text: "半信半疑", meaning: "有些相信，又有些怀疑", headPinyin: "ban", tailPinyin: "yi", difficulty: 1 },
  ]),
};
