import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePoemReview,
  serializePoemReviewSummary,
} from "../../packages/content-cli/src/poem-review";
import { sha256Text } from "../../packages/content-cli/src/poem-identity";

const candidatePath = new URL(
  "../candidates/poems-guwendao-tang-320.ndjson",
  import.meta.url,
);
const reviewPath = new URL(
  "../reviews/poems-guwendao-tang-320-review.ndjson",
  import.meta.url,
);
const summaryPath = new URL(
  "../reviews/poems-guwendao-tang-320-review-summary.md",
  import.meta.url,
);

function parseCandidateIds(text: string): string[] {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => (JSON.parse(line) as { id: string }).id);
}

describe("Guwendao poem review artifact", () => {
  it("locks the review decisions to the candidate snapshot", () => {
    const candidateText = readFileSync(candidatePath, "utf8");
    const reviewText = readFileSync(reviewPath, "utf8");
    const summaryText = readFileSync(summaryPath, "utf8");
    const reviews = parsePoemReview(reviewText);
    const candidates = parseCandidateIds(candidateText);

    expect(sha256Text(candidateText)).toBe(
      "b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def",
    );
    expect(sha256Text(reviewText)).toBe(
      "32d30bcd7c16ecf2c0bcd97a6d377eab17ac8a8d56d047bfd16b8223a367ee57",
    );
    expect(sha256Text(summaryText)).toBe(
      "2cbd98a3531838280039f24a20aa6e2a435644ced45b798f55841fa52d0e3b6d",
    );
    expect(summaryText).toBe(
      serializePoemReviewSummary(
        reviews,
        sha256Text(candidateText),
        sha256Text(reviewText),
      ),
    );
    expect(reviews.map(({ id }) => id).sort()).toEqual(candidates.sort());
    expect(
      reviews.filter(({ decision }) => decision === "ACTIVATE"),
    ).toHaveLength(310);
    expect(
      reviews
        .filter(({ decision }) => decision === "ARCHIVE_DUPLICATE")
        .map(({ id, title, author, duplicateOf }) => ({
          id,
          title,
          author,
          duplicateOf,
        })),
    ).toEqual([
      {
        id: "sc-gwd-0f81015a040c",
        title: "早发白帝城",
        author: "李白",
        duplicateOf: "sc-zaofabaidicheng",
      },
      {
        id: "sc-gwd-40954072f541",
        title: "寻隐者不遇",
        author: "贾岛",
        duplicateOf: "sc-xunyinzhe",
      },
      {
        id: "sc-gwd-58313be2d918",
        title: "江雪",
        author: "柳宗元",
        duplicateOf: "sc-jiangxue",
      },
      {
        id: "sc-gwd-c35a60c1a8e2",
        title: "静夜思",
        author: "李白",
        duplicateOf: "sc-jingyesi",
      },
      {
        id: "sc-gwd-c90ff9ea5a71",
        title: "登鹳雀楼",
        author: "王之涣",
        duplicateOf: "sc-dengguanquelou",
      },
      {
        id: "sc-gwd-ccee5691ba93",
        title: "春晓",
        author: "孟浩然",
        duplicateOf: "sc-chunxiao",
      },
      {
        id: "sc-gwd-e9b1a8b4def0",
        title: "鹿柴",
        author: "王维",
        duplicateOf: "sc-luzhai",
      },
      {
        id: "sc-gwd-ee9af27de9f2",
        title: "登乐游原",
        author: "李商隐",
        duplicateOf: "sc-dengleyouyuan",
      },
      {
        id: "sc-gwd-f324eea45183",
        title: "相思",
        author: "王维",
        duplicateOf: "sc-xiangsi",
      },
      {
        id: "sc-gwd-f459f8ed8d23",
        title: "回乡偶书",
        author: "贺知章",
        duplicateOf: "sc-huixiangoushu",
      },
    ]);
  });
});
