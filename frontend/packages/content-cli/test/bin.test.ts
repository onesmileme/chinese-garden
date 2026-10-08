import { describe, expect, it, vi } from "vitest";
import {
  chmod,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { run } from "../src/bin";
import { createHttpPoemReviewAdmin } from "../src/adapters/http-poem-review-admin";
import {
  writeTextAtomic,
  type AtomicFileOperations,
} from "../src/adapters/atomic-file";
import {
  buildGuwendaoPoemCandidates,
  serializeGuwendaoPoemCandidates,
  type GuwendaoPoemCandidate,
} from "../src/guwendao-poem-candidates";
import { sha256Text } from "../src/idiom-candidates";
import type { AdminPoemItem, ContentLevel } from "../src/poem-review";

describe("cc-content publish options", () => {
  it("requires content-level rule version before file or network access", async () => {
    const output = {
      log: vi.fn(),
      error: vi.fn(),
    };

    const code = await run(
      [
        "publish",
        "--version",
        "corpus-v5",
        "--rule-version",
        "mastery-v1",
        "--min-client-version",
        "1.0.0",
        "--approved-by",
        "reviewer",
        "--dry-run",
      ],
      {
        CONTENT_REPO_ROOT: "/path/that/must/not/be-read",
      },
      output,
    );

    expect(code).toBe(2);
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("--content-level-rule-version"),
    );
    expect(output.log).not.toHaveBeenCalled();
  });
});

describe("cc-content import command", () => {
  it("rejects an unknown command with usage exit code", async () => {
    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(["frobnicate"], {}, output);
    expect(code).toBe(2);
    expect(output.log).not.toHaveBeenCalled();
  });

  it("derives DRAFT items into a staging file without touching the corpus bank", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cc-import-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const corpusDir = join(contentRoot, "corpus");
    const sourcesDir = join(contentRoot, "sources");
    await mkdir(corpusDir, { recursive: true });
    await mkdir(sourcesDir, { recursive: true });

    // an existing ACTIVE L1 char so the poem importer can resolve a charRef
    await writeFile(
      join(corpusDir, "character-bank.json"),
      JSON.stringify({
        version: "corpus-v5",
        characters: [
          {
            id: "hz-shan-山",
            char: "山",
            pinyin: "shān",
            imageId: "img-shan",
            theme: "nature",
            strokes: 3,
            level: 1,
            difficulty: 1,
            promotionRequired: true,
            status: "ACTIVE",
            tags: [],
            revision: 1,
          },
        ],
      }),
    );

    await writeFile(
      join(sourcesDir, "poems-x.json"),
      JSON.stringify({
        type: "poems",
        level: 1,
        items: [
          {
            id: "sc-x",
            title: "测试",
            author: "佚名",
            lines: ["山高水远"],
            difficulty: 1,
          },
        ],
      }),
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      ["import", "--in", "sources/poems-x.json"],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(0);
    const staging = JSON.parse(
      await readFile(
        join(contentRoot, "staging", "poems-x.draft.json"),
        "utf8",
      ),
    );
    expect(staging.poems).toHaveLength(1);
    expect(staging.poems[0].id).toBe("sc-x");
    expect(staging.poems[0].status).toBe("DRAFT");
    expect(staging.poems[0].charRefs).toEqual(["hz-shan-山"]);

    // corpus bank stays untouched (still just the one seeded char, no poems file added)
    const bank = JSON.parse(
      await readFile(join(corpusDir, "character-bank.json"), "utf8"),
    );
    expect(bank.characters).toHaveLength(1);
  });

  it("aborts with exit 1 and stages nothing when an explicit charRef is invalid", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cc-import-bad-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const corpusDir = join(contentRoot, "corpus");
    const sourcesDir = join(contentRoot, "sources");
    await mkdir(corpusDir, { recursive: true });
    await mkdir(sourcesDir, { recursive: true });

    await writeFile(
      join(corpusDir, "character-bank.json"),
      JSON.stringify({ version: "corpus-v5", characters: [] }),
    );

    await writeFile(
      join(sourcesDir, "poems-bad.json"),
      JSON.stringify({
        type: "poems",
        level: 1,
        items: [
          {
            id: "sc-bad",
            title: "坏",
            author: "佚名",
            lines: ["山高水远"],
            charRefs: ["hz-nope-无"],
          },
        ],
      }),
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      ["import", "--in", "sources/poems-bad.json"],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(1);
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("POEM_CHAR_REF_MISSING"),
    );
    expect(output.log).not.toHaveBeenCalled();
    await expect(
      readFile(join(contentRoot, "staging", "poems-bad.draft.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("derives idiom drafts using the existing idiom bank as chain context", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cc-import-idiom-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const corpusDir = join(contentRoot, "corpus");
    const sourcesDir = join(contentRoot, "sources");
    await mkdir(corpusDir, { recursive: true });
    await mkdir(sourcesDir, { recursive: true });

    // an existing ACTIVE idiom starting with "li" so "月明千里" (tail li) chains
    await writeFile(
      join(corpusDir, "idiom-bank.json"),
      JSON.stringify({
        version: "corpus-v5",
        idioms: [
          {
            id: "cy-liyingwaihe",
            text: "里应外合",
            meaning: "内外配合",
            headPinyin: "li",
            tailPinyin: "he",
            level: 1,
            difficulty: 1,
            promotionRequired: true,
            status: "ACTIVE",
            tags: [],
            revision: 1,
          },
        ],
      }),
    );

    await writeFile(
      join(sourcesDir, "idioms-x.json"),
      JSON.stringify({
        type: "idioms",
        level: 3,
        items: [
          { text: "月明千里", meaning: "月光普照", pinyin: "yuè míng qiān lǐ" },
        ],
      }),
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      ["import", "--in", "sources/idioms-x.json"],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(0);
    const staging = JSON.parse(
      await readFile(
        join(contentRoot, "staging", "idioms-x.draft.json"),
        "utf8",
      ),
    );
    expect(staging.idioms).toHaveLength(1);
    expect(staging.idioms[0].id).toBe("cy-yuemingqianli");
    expect(staging.idioms[0].status).toBe("DRAFT");
  });
});

describe("cc-content raw-candidates command", () => {
  it("produces NDJSON, report, and manifest from raw mirrors", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "cc-raw-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const rawDir = join(contentRoot, "raw", "xinhua");
    const stagingDir = join(contentRoot, "staging", "raw-corpus-v1");
    await mkdir(rawDir, { recursive: true });

    // Write a minimal xinhua word.json
    await writeFile(
      join(rawDir, "word.json"),
      JSON.stringify([
        { word: "你", pinyin: "nǐ", strokes: 7 },
        { word: "好", pinyin: "hǎo", strokes: 6 },
        { word: "not-cjk", pinyin: "x", strokes: 0 },
      ]),
    );

    // Write a minimal xinhua idiom.json
    await writeFile(
      join(rawDir, "idiom.json"),
      JSON.stringify([
        { word: "一心一意", pinyin: "yī xīn yī yì", explanation: "专心专意" },
      ]),
    );

    // Write a minimal poetry file
    const poetryDir = join(contentRoot, "raw", "chinese-poetry", "test");
    await mkdir(poetryDir, { recursive: true });
    await writeFile(
      join(poetryDir, "test.json"),
      JSON.stringify([
        {
          title: "静夜思",
          author: "李白",
          paragraphs: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
        },
      ]),
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      [
        "raw-candidates",
        "--raw-root",
        contentRoot,
        "--out",
        stagingDir,
        "--characters",
        "3000",
        "--poems",
        "5000",
        "--idioms",
        "10000",
        "--rule-version",
        "raw-corpus-v1",
      ],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(0);

    // Verify NDJSON
    const ndjson = await readFile(
      join(stagingDir, "candidates.ndjson"),
      "utf8",
    );
    const lines = ndjson.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3); // 2 chars + 1 idiom + 1 poem

    const candidates = lines.map((l) => JSON.parse(l));
    const chars = candidates.filter((c: any) => c.type === "CHARACTER");
    expect(chars.length).toBe(2);
    expect(
      chars.map((candidate: any) => candidate.payload.char).sort(),
    ).toEqual(["你", "好"].sort());

    const idioms = candidates.filter((c: any) => c.type === "IDIOM");
    expect(idioms.length).toBe(1);

    const poems = candidates.filter((c: any) => c.type === "POEM");
    expect(poems.length).toBe(1);

    // Verify report
    const report = JSON.parse(
      await readFile(join(stagingDir, "report.json"), "utf8"),
    );
    expect(report.ruleVersion).toBe("raw-corpus-v1");
    expect(report.totals.output).toBe(4);

    // Verify manifest
    const manifest = JSON.parse(
      await readFile(join(stagingDir, "manifest.json"), "utf8"),
    );
    expect(manifest.ruleVersion).toBe("raw-corpus-v1");
    expect(manifest.fileSha256).toBeDefined();
  });
});

describe("cc-content ingest-candidates command", () => {
  function startMockServer(): Promise<{
    server: Server;
    url: string;
    requests: { method: string; path: string; body: unknown }[];
  }> {
    const requests: { method: string; path: string; body: unknown }[] = [];

    return new Promise((resolve, reject) => {
      const server = createServer(
        (req: IncomingMessage, res: ServerResponse) => {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            const bodyStr = Buffer.concat(chunks).toString();
            let body: unknown = null;
            try {
              body = JSON.parse(bodyStr);
            } catch {
              body = bodyStr;
            }
            requests.push({
              method: req.method ?? "GET",
              path: req.url ?? "/",
              body,
            });

            res.setHeader("Content-Type", "application/json");

            if (
              req.method === "POST" &&
              req.url === "/v1/admin/content-imports"
            ) {
              res.statusCode = 201;
              res.end(JSON.stringify({ id: "batch-1" }));
            } else if (
              req.method === "POST" &&
              req.url === "/v1/admin/content-imports/batch-1/candidates"
            ) {
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  imported: 2,
                  skipped: 0,
                  rejected: 0,
                }),
              );
            } else if (
              req.method === "POST" &&
              req.url === "/v1/admin/content-imports/batch-1/complete"
            ) {
              res.statusCode = 200;
              res.end(JSON.stringify({ status: "completed" }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "not found" }));
            }
          });
        },
      );

      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr === null || typeof addr === "string") {
          reject(new Error("failed to get server address"));
          return;
        }
        resolve({ server, url: `http://127.0.0.1:${addr.port}`, requests });
      });
    });
  }

  it("sends candidates to the admin API and completes the batch", async () => {
    const { server, url, requests } = await startMockServer();

    const repoRoot = await mkdtemp(join(tmpdir(), "cc-ingest-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const stagingDir = join(contentRoot, "staging", "raw-corpus-v1");
    await mkdir(stagingDir, { recursive: true });

    const candidates = Array.from({ length: 320 }, (_, index) => ({
      importKey: `GUWENDAO_POEM:${index}`,
      source: "GUWENDAO_POEM",
      sourceRef: `guwendao/tangshi.json:${index}`,
      sourceHash: `hash-${index}`,
      ruleVersion: "guwendao-tang-poem-v1",
      id: `sc-gwd-${index}`,
      type: "POEM",
      suggestedLevel: 1,
      suggestedDifficulty: 1,
      score: 10,
      tags: ["唐诗", "古文岛", "五言绝句"],
      payload: { title: `测试诗 ${index}` },
    }));
    await writeFile(
      join(stagingDir, "candidates.ndjson"),
      `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`,
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      [
        "ingest-candidates",
        "--in",
        join(stagingDir, "candidates.ndjson"),
        "--admin-url",
        url,
        "--admin-token",
        "test-token",
      ],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(0);

    // Verify the server received 3 requests: create batch, send candidates, complete
    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/admin/content-imports",
    });
    expect(requests[0]!.body).toEqual({
      ruleVersion: "guwendao-tang-poem-v1",
      candidateCount: 320,
    });

    expect(requests[1]).toMatchObject({
      method: "POST",
      path: "/v1/admin/content-imports/batch-1/candidates",
    });
    expect(requests[1]!.body).toHaveLength(320);

    expect(requests[2]).toMatchObject({
      method: "POST",
      path: "/v1/admin/content-imports/batch-1/complete",
    });

    // Verify log output
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining("chunk 1/1"),
    );

    server.close();
  });

  it("rejects an empty candidate file before creating a batch", async () => {
    const { server, url, requests } = await startMockServer();
    const root = await mkdtemp(join(tmpdir(), "cc-ingest-empty-"));
    const candidatePath = join(root, "candidates.ndjson");
    await writeFile(candidatePath, "\n");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(
        [
          "ingest-candidates",
          "--in",
          candidatePath,
          "--admin-url",
          url,
          "--admin-token",
          "test-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("candidate file must not be empty"),
      );
      expect(requests).toHaveLength(0);
    } finally {
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects mixed candidate rule versions before creating a batch", async () => {
    const { server, url, requests } = await startMockServer();
    const root = await mkdtemp(join(tmpdir(), "cc-ingest-mixed-rules-"));
    const candidatePath = join(root, "candidates.ndjson");
    await writeFile(
      candidatePath,
      `${JSON.stringify({ ruleVersion: "rule-v1" })}\n${JSON.stringify({
        ruleVersion: "rule-v2",
      })}\n`,
    );
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(
        [
          "ingest-candidates",
          "--in",
          candidatePath,
          "--admin-url",
          url,
          "--admin-token",
          "test-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("mixed ruleVersion"),
      );
      expect(requests).toHaveLength(0);
    } finally {
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exits with code 1 on HTTP error", async () => {
    const { server, url } = await startMockServer();

    const repoRoot = await mkdtemp(join(tmpdir(), "cc-ingest-err-"));
    const contentRoot = join(repoRoot, "frontend", "content");
    const stagingDir = join(contentRoot, "staging", "raw-corpus-v1");
    await mkdir(stagingDir, { recursive: true });

    // Pass a URL that will 404 on the first request (not the create-batch URL)
    await writeFile(
      join(stagingDir, "candidates.ndjson"),
      JSON.stringify({
        importKey: "XINHUA_WORD:word:你",
        source: "XINHUA_WORD",
        sourceRef: "xinhua/word.json:你",
        sourceHash: "abc123",
        ruleVersion: "raw-corpus-v1",
        id: "hz-ni-你",
        type: "CHARACTER",
        suggestedLevel: 1,
        suggestedDifficulty: 1,
        score: 10,
        tags: [],
        payload: {
          char: "你",
          pinyin: "nǐ",
          imageId: "img-你",
          theme: "world",
          strokes: 7,
        },
      }) + "\n",
    );

    const output = { log: vi.fn(), error: vi.fn() };
    const code = await run(
      [
        "ingest-candidates",
        "--in",
        join(stagingDir, "candidates.ndjson"),
        "--admin-url",
        `${url}/nonexistent-path`,
        "--admin-token",
        "test-token",
      ],
      { CONTENT_REPO_ROOT: repoRoot },
      output,
    );

    expect(code).toBe(1);
    expect(output.error).toHaveBeenCalled();

    server.close();
  });
});

describe("cc-content idiom-candidates command", () => {
  const candidateFile = "idioms-thuocl-top1000.ndjson";
  const manifestFile = "idioms-thuocl-top1000.manifest.json";
  const lockFile = ".idioms-thuocl-top1000.lock";

  async function createFixture(): Promise<{
    root: string;
    sourcePath: string;
    bankPath: string;
    outputDirectory: string;
  }> {
    const root = await mkdtemp(join(tmpdir(), "cc-idiom-candidates-"));
    const sourcePath = join(root, "THUOCL_chengyu.txt");
    const bankPath = join(root, "idiom-bank.json");
    const outputDirectory = join(root, "candidates");
    await mkdir(outputDirectory);
    await writeFile(sourcePath, "一心一意\t100\n山高水长\t30\n春夏秋冬\t20\n");
    await writeFile(
      bankPath,
      JSON.stringify({ idioms: [{ text: "一心一意" }] }),
    );
    return { root, sourcePath, bankPath, outputDirectory };
  }

  function commandArgs(fixture: {
    sourcePath: string;
    bankPath: string;
    outputDirectory: string;
  }): string[] {
    return [
      "idiom-candidates",
      "--source",
      relative(process.cwd(), fixture.sourcePath),
      "--bank",
      relative(process.cwd(), fixture.bankPath),
      "--out",
      relative(process.cwd(), fixture.outputDirectory),
      "--count",
      "2",
      "--source-commit",
      "a".repeat(40),
      "--fetched-at",
      "2026-09-26T00:00:00.000Z",
    ];
  }

  async function expectNoOutputFiles(outputDirectory: string): Promise<void> {
    expect(await readdir(outputDirectory)).toEqual([]);
  }

  it("writes deterministic candidate and manifest files from cwd-relative paths", async () => {
    const fixture = await createFixture();
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const args = commandArgs(fixture);
      const code = await run(args, {}, output);

      expect(code).toBe(0);
      expect(output.error).not.toHaveBeenCalled();
      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining("idiom-candidates: count=2"),
      );

      const candidatePath = join(fixture.outputDirectory, candidateFile);
      const manifestPath = join(fixture.outputDirectory, manifestFile);
      const firstCandidates = await readFile(candidatePath, "utf8");
      const firstManifest = await readFile(manifestPath, "utf8");
      const candidates = firstCandidates
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(candidates.map(({ text }) => text)).toEqual([
        "山高水长",
        "春夏秋冬",
      ]);
      expect(candidates[0].pinyin).toEqual(["shān", "gāo", "shuǐ", "cháng"]);

      const secondCode = await run(args, {}, output);
      expect(secondCode).toBe(0);
      expect(await readFile(candidatePath, "utf8")).toBe(firstCandidates);
      expect(await readFile(manifestPath, "utf8")).toBe(firstManifest);
      expect((await readdir(fixture.outputDirectory)).sort()).toEqual([
        manifestFile,
        candidateFile,
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    { name: "removes a newly committed candidate", original: undefined },
    {
      name: "restores an existing candidate",
      original: "original candidate\n",
    },
  ])("$name when the manifest rename fails", async ({ original }) => {
    const fixture = await createFixture();
    const candidatePath = join(fixture.outputDirectory, candidateFile);
    const manifestPath = join(fixture.outputDirectory, manifestFile);
    if (original !== undefined) {
      await writeFile(candidatePath, original);
    }
    await mkdir(manifestPath);
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(output.error).toHaveBeenCalled();
      expect(output.log).not.toHaveBeenCalled();
      if (original === undefined) {
        await expect(readFile(candidatePath, "utf8")).rejects.toThrow();
        expect(await readdir(fixture.outputDirectory)).toEqual([manifestFile]);
      } else {
        expect(await readFile(candidatePath, "utf8")).toBe(original);
        expect((await readdir(fixture.outputDirectory)).sort()).toEqual([
          manifestFile,
          candidateFile,
        ]);
      }
      expect(await readdir(manifestPath)).toEqual([]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("returns 1 without changing outputs when the output lock exists", async () => {
    const fixture = await createFixture();
    const candidatePath = join(fixture.outputDirectory, candidateFile);
    const manifestPath = join(fixture.outputDirectory, manifestFile);
    const lockPath = join(fixture.outputDirectory, lockFile);
    const originalCandidate = "original candidate\n";
    const originalManifest = "original manifest\n";
    await writeFile(candidatePath, originalCandidate);
    await writeFile(manifestPath, originalManifest);
    await writeFile(lockPath, "held");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(output.error).toHaveBeenCalled();
      expect(output.log).not.toHaveBeenCalled();
      expect(await readFile(candidatePath, "utf8")).toBe(originalCandidate);
      expect(await readFile(manifestPath, "utf8")).toBe(originalManifest);
      expect(await readFile(lockPath, "utf8")).toBe("held");
      expect((await readdir(fixture.outputDirectory)).sort()).toEqual([
        lockFile,
        manifestFile,
        candidateFile,
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "unknown option",
      change: (args: string[]) => [...args, "--unknown", "value"],
      message: "unknown option: --unknown",
    },
    {
      name: "duplicate option",
      change: (args: string[]) => [...args, "--count", "2"],
      message: "duplicate option: --count",
    },
    {
      name: "missing option value",
      change: (args: string[]) => [
        ...args.slice(0, args.indexOf("--count") + 1),
        ...args.slice(args.indexOf("--count") + 2),
      ],
      message: "missing value for --count",
    },
    {
      name: "missing required option",
      change: (args: string[]) => {
        const index = args.indexOf("--bank");
        return [...args.slice(0, index), ...args.slice(index + 2)];
      },
      message: "usage: cc-content idiom-candidates",
    },
    {
      name: "invalid count",
      change: (args: string[]) => {
        const changed = [...args];
        changed[changed.indexOf("--count") + 1] = "1.5";
        return changed;
      },
      message: "--count must be a positive integer",
    },
  ])(
    "rejects $name without leaving output files",
    async ({ change, message }) => {
      const fixture = await createFixture();
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(change(commandArgs(fixture)), {}, output);

        expect(code).toBe(2);
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining(message),
        );
        expect(output.log).not.toHaveBeenCalled();
        await expectNoOutputFiles(fixture.outputDirectory);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("rejects malformed source content without leaving output files", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.sourcePath, "malformed source\n");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("THUOCL line 1"),
      );
      expect(output.log).not.toHaveBeenCalled();
      await expectNoOutputFiles(fixture.outputDirectory);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(["missing", "malformed"])(
    "rejects a %s bank without leaving output files",
    async (kind) => {
      const fixture = await createFixture();
      if (kind === "missing") {
        await rm(fixture.bankPath);
      } else {
        await writeFile(fixture.bankPath, "{not-json");
      }
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(commandArgs(fixture), {}, output);

        expect(code).toBe(1);
        expect(output.error).toHaveBeenCalled();
        expect(output.log).not.toHaveBeenCalled();
        await expectNoOutputFiles(fixture.outputDirectory);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );
});

describe("cc-content guwendao-poem-candidates command", () => {
  function sourceDocument(): {
    recordCount: number;
    errors: string[];
    poems: {
      sourceId: string;
      category: string;
      indexTitle: string;
      title: string;
      author: string;
      dynasty: string;
      text: string;
      lines: string[];
      sourceUrl: string;
    }[];
  } {
    const poems = Array.from({ length: 320 }, (_, index) => {
      const sourceId = index.toString(16).padStart(12, "0");
      const lines = ["第一句。", "第二句。"];
      return {
        sourceId,
        category: "五言绝句",
        indexTitle: `测试诗 ${index}`,
        title: `测试诗 ${index}`,
        author: "测试作者",
        dynasty: "唐代",
        text: lines.join("\n"),
        lines,
        sourceUrl: `https://www.guwendao.net/shiwenv_${sourceId}.aspx`,
      };
    });
    return { recordCount: poems.length, errors: [], poems };
  }

  async function createFixture(): Promise<{
    root: string;
    sourcePath: string;
    outputPath: string;
  }> {
    const root = await mkdtemp(join(tmpdir(), "cc-guwendao-poems-"));
    const sourcePath = join(root, "tangshi.json");
    const outputPath = join(root, "candidates", "poems.ndjson");
    await writeFile(sourcePath, JSON.stringify(sourceDocument()));
    return { root, sourcePath, outputPath };
  }

  function commandArgs(fixture: {
    sourcePath: string;
    outputPath: string;
  }): string[] {
    return [
      "guwendao-poem-candidates",
      "--source",
      fixture.sourcePath,
      "--out",
      fixture.outputPath,
    ];
  }

  it("writes all converted candidates to the requested output", async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.root, "candidates"));
    await writeFile(fixture.outputPath, "previous candidates\n");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(0);
      expect(await readFile(fixture.outputPath, "utf8")).toBe(
        serializeGuwendaoPoemCandidates(
          buildGuwendaoPoemCandidates(sourceDocument()),
        ),
      );
      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining("guwendao-poem-candidates: count=320"),
      );
      expect(output.error).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("leaves an existing output unchanged when the source is invalid", async () => {
    const fixture = await createFixture();
    const originalOutput = "existing candidates\n";
    await mkdir(join(fixture.root, "candidates"));
    await writeFile(fixture.outputPath, originalOutput);
    await writeFile(fixture.sourcePath, JSON.stringify({ recordCount: 319 }));
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(await readFile(fixture.outputPath, "utf8")).toBe(originalOutput);
      expect(output.error).toHaveBeenCalled();
      expect(output.log).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects the source path as output without changing the source", async () => {
    const fixture = await createFixture();
    const originalSource = await readFile(fixture.sourcePath, "utf8");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(
        commandArgs({
          sourcePath: fixture.sourcePath,
          outputPath: fixture.sourcePath,
        }),
        {},
        output,
      );

      expect(code).toBe(1);
      expect(await readFile(fixture.sourcePath, "utf8")).toBe(originalSource);
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("same file"),
      );
      expect(output.log).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    "source symlink points to output",
    "output symlink points to source",
  ] as const)(
    "rejects path aliases when %s without changing the source",
    async (direction) => {
      const fixture = await createFixture();
      const originalSource = await readFile(fixture.sourcePath, "utf8");
      await mkdir(join(fixture.root, "candidates"));
      if (direction === "source symlink points to output") {
        await writeFile(fixture.outputPath, originalSource);
        await rm(fixture.sourcePath);
        await symlink(fixture.outputPath, fixture.sourcePath);
      } else {
        await symlink(fixture.sourcePath, fixture.outputPath);
      }
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(commandArgs(fixture), {}, output);

        expect(code).toBe(1);
        expect(await readFile(fixture.sourcePath, "utf8")).toBe(originalSource);
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining("same file"),
        );
        expect(output.log).not.toHaveBeenCalled();
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("returns 1 without changing files when the output lock exists", async () => {
    const fixture = await createFixture();
    const originalOutput = "existing candidates\n";
    const lockPath = `${fixture.outputPath}.lock`;
    await mkdir(join(fixture.root, "candidates"));
    await writeFile(fixture.outputPath, originalOutput);
    await writeFile(lockPath, "held");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(await readFile(fixture.outputPath, "utf8")).toBe(originalOutput);
      expect(await readFile(lockPath, "utf8")).toBe("held");
      expect((await readdir(join(fixture.root, "candidates"))).sort()).toEqual([
        "poems.ndjson",
        "poems.ndjson.lock",
      ]);
      expect(output.error).toHaveBeenCalled();
      expect(output.log).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("cc-content idiom-review-candidates command", () => {
  async function createFixture(): Promise<{
    root: string;
    candidatePath: string;
    manifestPath: string;
    outputPath: string;
  }> {
    const root = await mkdtemp(join(tmpdir(), "cc-idiom-review-"));
    const candidatePath = join(root, "idioms.ndjson");
    const manifestPath = join(root, "manifest.json");
    const outputPath = join(root, "output", "idioms.ndjson");
    const commonCharacters = Array.from("一二三四五六七八");
    const candidates = Array.from({ length: 1000 }, (_, index) => {
      const text =
        index === 0
          ? "坚定不移"
          : index === 1
            ? "丰富多彩"
            : Array.from({ length: 4 }, (_unused, position) => {
                const divisor = 8 ** (3 - position);
                return commonCharacters[Math.floor(index / divisor) % 8]!;
              }).join("");
      const characters = Array.from(text);
      return {
        id: `idiom-candidate-${String(index + 1).padStart(4, "0")}`,
        text,
        pinyin:
          index === 0
            ? ["jiān", "dìng", "bù", "yí"]
            : index === 1
              ? ["fēng", "fù", "duō", "cǎi"]
              : ["yī", "èr", "sān", "sì"],
        head: characters[0],
        tail: characters[3],
        frequency: 1000 - index,
        sourceRank: index + 1,
        status: "NEEDS_MEANING",
        reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
      };
    });
    const candidateText = `${candidates
      .map((candidate) => JSON.stringify(candidate))
      .join("\n")}\n`;
    await writeFile(candidatePath, candidateText);
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: "idiom-candidates-v1",
        source: {
          name: "THUOCL",
          url: "https://example.com/THUOCL_chengyu.txt",
          commit: "a".repeat(40),
        },
        output: {
          count: candidates.length,
          sha256: sha256Text(candidateText),
        },
      }),
    );
    return { root, candidatePath, manifestPath, outputPath };
  }

  function commandArgs(fixture: {
    candidatePath: string;
    manifestPath: string;
    outputPath: string;
  }): string[] {
    return [
      "idiom-review-candidates",
      "--in",
      relative(process.cwd(), fixture.candidatePath),
      "--manifest",
      relative(process.cwd(), fixture.manifestPath),
      "--out",
      relative(process.cwd(), fixture.outputPath),
    ];
  }

  async function seedOutput(
    fixture: { outputPath: string },
    content = "existing review candidates\n",
  ): Promise<string> {
    await mkdir(join(fixture.outputPath, ".."), { recursive: true });
    await writeFile(fixture.outputPath, content);
    return content;
  }

  async function expectOutputUnchangedWithoutTemporaryFiles(
    fixture: { outputPath: string },
    originalOutput: string,
    additionalFiles: string[] = [],
  ): Promise<void> {
    expect(await readFile(fixture.outputPath, "utf8")).toBe(originalOutput);
    expect((await readdir(join(fixture.outputPath, ".."))).sort()).toEqual(
      ["idioms.ndjson", ...additionalFiles].sort(),
    );
  }

  it("writes all review candidates to the requested output", async () => {
    const fixture = await createFixture();
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(0);
      const lines = (await readFile(fixture.outputPath, "utf8"))
        .trim()
        .split("\n");
      expect(lines).toHaveLength(1000);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        importKey: "THUOCL_IDIOM:idiom-candidate-0001",
        type: "IDIOM",
        payload: {
          text: "坚定不移",
          headPinyin: "jian",
          tailPinyin: "yi",
        },
      });
      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining("idiom-review-candidates: count=1000"),
      );
      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining(fixture.outputPath),
      );
      expect(output.error).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "unknown option",
      change: (args: string[]) => [...args, "--unknown", "value"],
      message: "unknown option: --unknown",
    },
    {
      name: "duplicate option",
      change: (args: string[]) => [...args, "--out", "duplicate.ndjson"],
      message: "duplicate option: --out",
    },
    {
      name: "missing option value",
      change: (args: string[]) => {
        const index = args.indexOf("--manifest");
        return [...args.slice(0, index + 1), ...args.slice(index + 2)];
      },
      message: "missing value for --manifest",
    },
    {
      name: "missing required option",
      change: (args: string[]) => {
        const index = args.indexOf("--manifest");
        return [...args.slice(0, index), ...args.slice(index + 2)];
      },
      message: "usage: cc-content idiom-review-candidates",
    },
  ])(
    "rejects $name without changing the output",
    async ({ change, message }) => {
      const fixture = await createFixture();
      const originalOutput = await seedOutput(fixture);
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(change(commandArgs(fixture)), {}, output);

        expect(code).toBe(2);
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining(message),
        );
        expect(output.log).not.toHaveBeenCalled();
        await expectOutputUnchangedWithoutTemporaryFiles(
          fixture,
          originalOutput,
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.each(["candidate", "manifest"] as const)(
    "rejects an invalid %s file without changing the output",
    async (invalidInput) => {
      const fixture = await createFixture();
      const originalOutput = await seedOutput(fixture);
      if (invalidInput === "candidate") {
        const invalidCandidateText = "{\n";
        await writeFile(fixture.candidatePath, invalidCandidateText);
        await writeFile(
          fixture.manifestPath,
          JSON.stringify({
            schemaVersion: "idiom-candidates-v1",
            source: {
              name: "THUOCL",
              url: "https://example.com/THUOCL_chengyu.txt",
              commit: "a".repeat(40),
            },
            output: {
              count: 1000,
              sha256: sha256Text(invalidCandidateText),
            },
          }),
        );
      } else {
        await writeFile(fixture.manifestPath, "{");
      }
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(commandArgs(fixture), {}, output);

        expect(code).toBe(1);
        expect(output.error).toHaveBeenCalled();
        expect(output.log).not.toHaveBeenCalled();
        await expectOutputUnchangedWithoutTemporaryFiles(
          fixture,
          originalOutput,
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.each(["candidate", "manifest"] as const)(
    "rejects the %s path as output without changing the input",
    async (aliasedInput) => {
      const fixture = await createFixture();
      const aliasedPath =
        aliasedInput === "candidate"
          ? fixture.candidatePath
          : fixture.manifestPath;
      const originalInput = await readFile(aliasedPath, "utf8");
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(
          commandArgs({ ...fixture, outputPath: aliasedPath }),
          {},
          output,
        );

        expect(code).toBe(1);
        expect(await readFile(aliasedPath, "utf8")).toBe(originalInput);
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining("same file"),
        );
        expect(output.log).not.toHaveBeenCalled();
        expect((await readdir(fixture.root)).sort()).toEqual([
          "idioms.ndjson",
          "manifest.json",
        ]);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    "candidate symlink points to output",
    "output symlink points to candidate",
  ] as const)(
    "rejects path aliases when %s without changing the input",
    async (direction) => {
      const fixture = await createFixture();
      const candidateText = await readFile(fixture.candidatePath, "utf8");
      await mkdir(join(fixture.outputPath, ".."), { recursive: true });
      if (direction === "candidate symlink points to output") {
        await writeFile(fixture.outputPath, candidateText);
        await rm(fixture.candidatePath);
        await symlink(fixture.outputPath, fixture.candidatePath);
      } else {
        await symlink(fixture.candidatePath, fixture.outputPath);
      }
      const output = { log: vi.fn(), error: vi.fn() };

      try {
        const code = await run(commandArgs(fixture), {}, output);

        expect(code).toBe(1);
        expect(await readFile(fixture.candidatePath, "utf8")).toBe(
          candidateText,
        );
        expect(await readFile(fixture.outputPath, "utf8")).toBe(candidateText);
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining("same file"),
        );
        expect(output.log).not.toHaveBeenCalled();
        await expectOutputUnchangedWithoutTemporaryFiles(
          fixture,
          candidateText,
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it("returns 1 without changing files when the output lock exists", async () => {
    const fixture = await createFixture();
    const originalOutput = await seedOutput(fixture);
    const lockPath = `${fixture.outputPath}.lock`;
    await writeFile(lockPath, "held");
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(commandArgs(fixture), {}, output);

      expect(code).toBe(1);
      expect(await readFile(lockPath, "utf8")).toBe("held");
      expect(output.error).toHaveBeenCalled();
      expect(output.log).not.toHaveBeenCalled();
      await expectOutputUnchangedWithoutTemporaryFiles(
        fixture,
        originalOutput,
        ["idioms.ndjson.lock"],
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

describe("atomic text file", () => {
  it("releases its lock and preserves the rename error when temp cleanup fails", async () => {
    const renameError = new Error("rename failed");
    const tempCleanupError = new Error("temp cleanup failed");
    const lockClose = vi.fn(async () => {});
    const lockRemove = vi.fn(async () => {});
    const temporaryClose = vi.fn(async () => {});
    const operations: AtomicFileOperations = {
      mkdir: vi.fn(async () => {}),
      open: vi
        .fn()
        .mockResolvedValueOnce({
          writeFile: vi.fn(async () => {}),
          close: lockClose,
        })
        .mockResolvedValueOnce({
          writeFile: vi.fn(async () => {}),
          close: temporaryClose,
        }),
      rename: vi.fn(async () => {
        throw renameError;
      }),
      rm: vi.fn(async (path) => {
        if (path.endsWith(".lock")) {
          await lockRemove();
          return;
        }
        throw tempCleanupError;
      }),
    };

    await expect(
      writeTextAtomic("/reports/report.json", "new report\n", operations),
    ).rejects.toBe(renameError);
    expect(temporaryClose).toHaveBeenCalledOnce();
    expect(lockClose).toHaveBeenCalledOnce();
    expect(lockRemove).toHaveBeenCalledOnce();
  });

  it("removes its lock and preserves the producer error when lock close fails", async () => {
    const producerError = new Error("producer failed");
    const lockCloseError = new Error("lock close failed");
    const lockRemove = vi.fn(async () => {});
    const operations: AtomicFileOperations = {
      mkdir: vi.fn(async () => {}),
      open: vi
        .fn()
        .mockResolvedValueOnce({
          writeFile: vi.fn(async () => {}),
          close: vi.fn(async () => {
            throw lockCloseError;
          }),
        })
        .mockResolvedValueOnce({
          writeFile: vi.fn(async () => {}),
          close: vi.fn(async () => {}),
        }),
      rename: vi.fn(async () => {}),
      rm: vi.fn(async (path) => {
        if (path.endsWith(".lock")) await lockRemove();
      }),
    };

    await expect(
      writeTextAtomic(
        "/reports/report.json",
        async () => {
          throw producerError;
        },
        operations,
      ),
    ).rejects.toBe(producerError);
    expect(lockRemove).toHaveBeenCalledOnce();
  });
});

interface PoemReviewRequest {
  method: string;
  url: string;
  token: string | undefined;
  actor: string | undefined;
  contentType: string | undefined;
  body: string;
}

interface PoemReviewHttpFixture {
  root: string;
  candidatePath: string;
  checklistPath: string;
  summaryPath: string;
  reportPath: string;
  url: string;
  requests: PoemReviewRequest[];
  items: Map<string, AdminPoemItem>;
  failNextAction(status: number, body: string): void;
  invalidateNextValidation(body: string): void;
  invalidateNextList(body: string): void;
  failListPageAfter(cursor: string, status: number, body: string): void;
  duplicateCatalogIdAcrossPages(id?: string): void;
  repeatCatalogCursor(cursor: string): void;
  close(): Promise<void>;
}

const poemCandidatePath = new URL(
  "../../../content/candidates/poems-guwendao-tang-320.ndjson",
  import.meta.url,
);
const poemBankPath = new URL(
  "../../../content/corpus/poem-bank.json",
  import.meta.url,
);
const TITLE_DISAMBIGUATED_CANDIDATE_IDS = [
  "sc-gwd-05c6c4ccf634",
  "sc-gwd-09fd71c77ec7",
  "sc-gwd-0c472e85a3ad",
  "sc-gwd-2d27cb0ecae4",
] as const;

function expectedPoemCandidateRevision(id: string): number {
  return TITLE_DISAMBIGUATED_CANDIDATE_IDS.some(
    (candidateId) => candidateId === id,
  )
    ? 2
    : 1;
}

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function createPoemReviewHttpFixture(): Promise<PoemReviewHttpFixture> {
  const root = await mkdtemp(join(tmpdir(), "cc-poem-review-"));
  const candidatePath = poemCandidatePath.pathname;
  const checklistPath = join(root, "review", "review.ndjson");
  const summaryPath = join(root, "summary", "summary.md");
  const reportPath = join(root, "report", "report.json");
  const candidates = (await readFile(candidatePath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as GuwendaoPoemCandidate);
  const poemBank = JSON.parse(await readFile(poemBankPath, "utf8")) as {
    poems: Array<{
      id: string;
      title: string;
      author: string;
      lines: string[];
      charRefs: string[];
      level: number;
      difficulty: number;
      promotionRequired: boolean;
      status: "ACTIVE";
      tags: string[];
      revision: number;
    }>;
  };
  const activeItems: AdminPoemItem[] = poemBank.poems.map((poem) => ({
    id: poem.id,
    type: "POEM",
    status: poem.status,
    revision: poem.revision,
    level: `L${poem.level}` as ContentLevel,
    difficulty: `L${poem.difficulty}` as ContentLevel,
    promotionRequired: poem.promotionRequired,
    tags: poem.tags,
    payload: {
      title: poem.title,
      author: poem.author,
      lines: poem.lines,
      charRefs: poem.charRefs,
    },
  }));
  const draftItems: AdminPoemItem[] = candidates.map((candidate) => ({
    id: candidate.id,
    type: "POEM",
    status: "DRAFT",
    revision: expectedPoemCandidateRevision(candidate.id),
    level: "L5",
    difficulty: "L5",
    promotionRequired: candidate.promotionRequired,
    tags: candidate.tags,
    payload: structuredClone(candidate.payload),
  }));
  const items = new Map(
    [...activeItems, ...draftItems].map((item) => [item.id, item]),
  );
  const catalog = [...items.values()];
  const cursors = ["page /一", "page ?二", "page &三"];
  const requests: PoemReviewRequest[] = [];
  let actionFailure: { status: number; body: string } | undefined;
  let invalidValidationBody: string | undefined;
  let invalidListBody: string | undefined;
  let listFailure: { cursor: string; status: number; body: string } | undefined;
  let repeatedCursor: string | undefined;
  let repeatedCursorResponses = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const body = await requestBody(request);
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        token: request.headers["x-admin-token"] as string | undefined,
        actor: request.headers["x-actor"] as string | undefined,
        contentType: request.headers["content-type"],
        body,
      });
      const url = new URL(request.url ?? "/", "http://localhost");
      if (
        request.method === "GET" &&
        url.pathname === "/v1/admin/content/items"
      ) {
        if (
          listFailure !== undefined &&
          url.searchParams.get("cursor") === listFailure.cursor
        ) {
          const failure = listFailure;
          listFailure = undefined;
          response.writeHead(failure.status, {
            "Content-Type": "application/json",
          });
          response.end(failure.body);
          return;
        }
        if (invalidListBody !== undefined) {
          const invalidBody = invalidListBody;
          invalidListBody = undefined;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(invalidBody);
          return;
        }
        if (repeatedCursor !== undefined) {
          if (repeatedCursorResponses > 0) {
            repeatedCursorResponses -= 1;
            sendJson(response, 200, {
              items: [],
              nextCursor: repeatedCursor,
            });
          } else {
            sendJson(response, 508, { error: "fixture pagination loop" });
          }
          return;
        }
        const cursor = url.searchParams.get("cursor");
        const page = cursor === null ? 0 : cursors.indexOf(cursor) + 1;
        if (page < 0) {
          sendJson(response, 400, { error: "unknown cursor" });
          return;
        }
        sendJson(response, 200, {
          items: catalog.slice(page * 100, page * 100 + 100),
          nextCursor: cursors[page] ?? null,
        });
        return;
      }
      if (
        request.method === "POST" &&
        /^\/v1\/admin\/content\/items\/[^/]+\/validate$/.test(url.pathname)
      ) {
        if (invalidValidationBody !== undefined) {
          const invalidBody = invalidValidationBody;
          invalidValidationBody = undefined;
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(invalidBody);
          return;
        }
        sendJson(response, 200, { valid: true, issues: [] });
        return;
      }
      const actionMatch = url.pathname.match(
        /^\/v1\/admin\/content\/items\/([^/]+)\/(activate|archive)$/,
      );
      if (request.method === "POST" && actionMatch !== null) {
        if (actionFailure !== undefined) {
          const failure = actionFailure;
          actionFailure = undefined;
          response.writeHead(failure.status, {
            "Content-Type": "application/json",
          });
          response.end(failure.body);
          return;
        }
        const id = decodeURIComponent(actionMatch[1]!);
        const item = items.get(id);
        if (item === undefined) {
          sendJson(response, 404, { error: "missing item" });
          return;
        }
        if (
          url.searchParams.get("expectedRevision") !== String(item.revision)
        ) {
          sendJson(response, 409, { error: "wrong revision" });
          return;
        }
        item.status = actionMatch[2] === "activate" ? "ACTIVE" : "ARCHIVED";
        sendJson(response, 200, item);
        return;
      }
      sendJson(response, 404, { error: "not found" });
    })().catch((error: unknown) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("mock server did not bind a TCP port");
  }
  return {
    root,
    candidatePath,
    checklistPath,
    summaryPath,
    reportPath,
    url: `http://127.0.0.1:${address.port}`,
    requests,
    items,
    failNextAction(status, body) {
      actionFailure = { status, body };
    },
    invalidateNextValidation(body) {
      invalidValidationBody = body;
    },
    invalidateNextList(body) {
      invalidListBody = body;
    },
    failListPageAfter(cursor, status, body) {
      cursors[0] = cursor;
      listFailure = { cursor, status, body };
    },
    duplicateCatalogIdAcrossPages(id) {
      if (id !== undefined) catalog[0]!.id = id;
      catalog[100] = structuredClone(catalog[0]!);
    },
    repeatCatalogCursor(cursor) {
      repeatedCursor = cursor;
      repeatedCursorResponses = 2;
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      });
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe("cc-content poem review commands", () => {
  const checklistUsage =
    "usage: cc-content poem-review-checklist --in <candidates.ndjson> --out <review.ndjson> --summary <summary.md> --admin-url <url> --admin-token <token>";
  const applyUsage =
    "usage: cc-content apply-poem-review --in <review.ndjson> --report <report.json> --admin-url <url> --admin-token <token>";

  it.each([
    {
      name: "checklist unknown option",
      usage: checklistUsage,
      args: [
        "poem-review-checklist",
        "--in",
        "/must/not/read",
        "--out",
        "/must/not/write",
        "--summary",
        "/must/not/write-summary",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
        "--unknown",
      ],
    },
    {
      name: "checklist duplicate option",
      usage: checklistUsage,
      args: [
        "poem-review-checklist",
        "--in",
        "/must/not/read",
        "--out",
        "/must/not/write",
        "--summary",
        "/must/not/write-summary",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
        "--out",
        "/duplicate",
      ],
    },
    {
      name: "checklist missing value",
      usage: checklistUsage,
      args: [
        "poem-review-checklist",
        "--in",
        "/must/not/read",
        "--out",
        "/must/not/write",
        "--summary",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
      ],
    },
    {
      name: "checklist missing required option",
      usage: checklistUsage,
      args: [
        "poem-review-checklist",
        "--in",
        "/must/not/read",
        "--out",
        "/must/not/write",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
      ],
    },
    {
      name: "apply unknown option",
      usage: applyUsage,
      args: [
        "apply-poem-review",
        "--in",
        "/must/not/read",
        "--report",
        "/must/not/write",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
        "--unknown",
      ],
    },
    {
      name: "apply duplicate option",
      usage: applyUsage,
      args: [
        "apply-poem-review",
        "--in",
        "/must/not/read",
        "--report",
        "/must/not/write",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
        "--report",
        "/duplicate",
      ],
    },
    {
      name: "apply missing value",
      usage: applyUsage,
      args: [
        "apply-poem-review",
        "--in",
        "/must/not/read",
        "--report",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
      ],
    },
    {
      name: "apply missing required option",
      usage: applyUsage,
      args: [
        "apply-poem-review",
        "--in",
        "/must/not/read",
        "--admin-url",
        "http://must-not-connect",
        "--admin-token",
        "secret-token",
      ],
    },
  ])("rejects $name with exact usage and code 2", async ({ args, usage }) => {
    const output = { log: vi.fn(), error: vi.fn() };

    const code = await run(args, {}, output);

    expect(code).toBe(2);
    expect(output.log).not.toHaveBeenCalled();
    expect(output.error).toHaveBeenCalledOnce();
    const message = output.error.mock.calls[0]![0];
    expect(message === usage || message.endsWith(`\n${usage}`)).toBe(true);
    expect(message).not.toContain("secret-token");
  });

  it.each([
    "input equals checklist",
    "checklist symlinks to input",
    "checklist equals summary",
  ] as const)(
    "rejects checklist path conflicts before HTTP when %s",
    async (conflict) => {
      const fixture = await createPoemReviewHttpFixture();
      const inputPath = join(fixture.root, "input.ndjson");
      const inputText = await readFile(fixture.candidatePath, "utf8");
      await writeFile(inputPath, inputText);
      let checklistPath = fixture.checklistPath;
      let summaryPath = fixture.summaryPath;
      const oldOutput = "old output\n";

      try {
        if (conflict === "input equals checklist") {
          checklistPath = inputPath;
        } else if (conflict === "checklist symlinks to input") {
          await mkdir(join(checklistPath, ".."), { recursive: true });
          await symlink(inputPath, checklistPath);
        } else {
          summaryPath = checklistPath;
          await mkdir(join(checklistPath, ".."), { recursive: true });
          await writeFile(checklistPath, oldOutput);
        }
        const output = { log: vi.fn(), error: vi.fn() };

        const code = await run(
          [
            "poem-review-checklist",
            "--in",
            inputPath,
            "--out",
            checklistPath,
            "--summary",
            summaryPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "secret-token",
          ],
          {},
          output,
        );

        expect(code).toBe(1);
        expect(fixture.requests).toHaveLength(0);
        expect(await readFile(inputPath, "utf8")).toBe(inputText);
        if (conflict === "checklist equals summary") {
          expect(await readFile(checklistPath, "utf8")).toBe(oldOutput);
        }
        expect(output.log).not.toHaveBeenCalled();
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining("same file"),
        );
      } finally {
        await fixture.close();
      }
    },
  );

  it("rejects nonexistent checklist output aliases through symlinked parent directories before HTTP", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const realOutputDir = join(fixture.root, "real-output");
    const aliasOutputDir = join(fixture.root, "alias-output");
    const checklistPath = join(realOutputDir, "result");
    const summaryPath = join(aliasOutputDir, "result");
    await mkdir(realOutputDir);
    await symlink(realOutputDir, aliasOutputDir);
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          checklistPath,
          "--summary",
          summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(fixture.requests).toHaveLength(0);
      expect(await readdir(realOutputDir)).toEqual([]);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("same file"),
      );
    } finally {
      await fixture.close();
    }
  });

  it.each(["input equals report", "report symlinks to input"] as const)(
    "rejects apply path conflicts before HTTP when %s",
    async (conflict) => {
      const fixture = await createPoemReviewHttpFixture();
      const inputPath = join(fixture.root, "review.ndjson");
      const inputText = "old review input\n";
      await writeFile(inputPath, inputText);
      let reportPath = inputPath;

      try {
        if (conflict === "report symlinks to input") {
          reportPath = fixture.reportPath;
          await mkdir(join(reportPath, ".."), { recursive: true });
          await symlink(inputPath, reportPath);
        }
        const output = { log: vi.fn(), error: vi.fn() };

        const code = await run(
          [
            "apply-poem-review",
            "--in",
            inputPath,
            "--report",
            reportPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "secret-token",
          ],
          {},
          output,
        );

        expect(code).toBe(1);
        expect(fixture.requests).toHaveLength(0);
        expect(await readFile(inputPath, "utf8")).toBe(inputText);
        expect(output.log).not.toHaveBeenCalled();
        expect(output.error).toHaveBeenCalledWith(
          expect.stringContaining("same file"),
        );
      } finally {
        await fixture.close();
      }
    },
  );

  it("generates a 310/10 checklist through every HTTP catalog page", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(0);
      const checklistText = await readFile(fixture.checklistPath, "utf8");
      const entries = checklistText
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { decision: string });
      expect(checklistText.endsWith("\n")).toBe(true);
      expect(entries).toHaveLength(320);
      expect(
        entries.filter(({ decision }) => decision === "ACTIVATE"),
      ).toHaveLength(310);
      expect(
        entries.filter(({ decision }) => decision === "ARCHIVE_DUPLICATE"),
      ).toHaveLength(10);
      const summaryText = await readFile(fixture.summaryPath, "utf8");
      expect(summaryText.endsWith("\n")).toBe(true);
      expect(summaryText).toContain("- Activate: 310");
      expect(summaryText).toContain("- Archive duplicate: 10");

      const listRequests = fixture.requests.filter(
        ({ method }) => method === "GET",
      );
      expect(listRequests.map(({ url }) => url)).toEqual([
        "/v1/admin/content/items?type=POEM&limit=100",
        "/v1/admin/content/items?type=POEM&limit=100&cursor=page+%2F%E4%B8%80",
        "/v1/admin/content/items?type=POEM&limit=100&cursor=page+%3F%E4%BA%8C",
        "/v1/admin/content/items?type=POEM&limit=100&cursor=page+%26%E4%B8%89",
      ]);
      expect(
        fixture.requests.filter(({ url }) => url.endsWith("/validate")),
      ).toHaveLength(310);
      expect(
        fixture.requests.every(
          ({ token, actor, contentType }) =>
            token === "secret-token" &&
            actor === undefined &&
            contentType === "application/json",
        ),
      ).toBe(true);
      expect(output.log).toHaveBeenCalledWith(
        `poem-review-checklist: total=320 activate=310 archive=10 out=${fixture.checklistPath} summary=${fixture.summaryPath}`,
      );
      expect(output.error).not.toHaveBeenCalled();
      expect(
        JSON.stringify([...output.log.mock.calls, ...output.error.mock.calls]),
      ).not.toContain("secret-token");
    } finally {
      await fixture.close();
    }
  });

  it("redacts raw and encoded tokens from paginated HTTP errors", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const token = "secret /?&+=";
    const uriEncodedToken = "secret%20%2F%3F%26%2B%3D";
    const formEncodedToken = "secret+%2F%3F%26%2B%3D";
    fixture.failListPageAfter(
      token,
      502,
      `${token}|${uriEncodedToken}|${formEncodedToken}|${token}`,
    );

    try {
      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          token,
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledOnce();
      const diagnostic = output.error.mock.calls[0]![0];
      expect(diagnostic).toContain("[REDACTED]");
      expect(diagnostic).not.toContain(token);
      expect(diagnostic).not.toContain(uriEncodedToken);
      expect(diagnostic).not.toContain(formEncodedToken);
    } finally {
      await fixture.close();
    }
  });

  it("does not redact diagnostics when the admin token is empty", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    fixture.failListPageAfter("next page", 502, "upstream body");

    try {
      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("upstream body"),
      );
      expect(output.error).not.toHaveBeenCalledWith(
        expect.stringContaining("[REDACTED]"),
      );
    } finally {
      await fixture.close();
    }
  });

  it("redacts a token used as a duplicate catalog item ID", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const token = "duplicate /?&+=";
    fixture.duplicateCatalogIdAcrossPages(token);

    try {
      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          token,
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        "content admin returned duplicate poem ID [REDACTED]",
      );
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(token);
    } finally {
      await fixture.close();
    }
  });

  it("encodes poem IDs and revisions for every HTTP action", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const id = "poem/诗 ?&#";
    const item = structuredClone(
      [...fixture.items.values()].find(({ status }) => status === "DRAFT")!,
    );
    item.id = id;
    item.revision = 7;
    fixture.items.set(id, item);
    const admin = createHttpPoemReviewAdmin({
      baseUrl: `${fixture.url}/`,
      token: "secret-token",
    });

    try {
      await expect(admin.validate(id)).resolves.toEqual({
        valid: true,
        issues: [],
      });
      await expect(admin.activate(id, 7)).resolves.toMatchObject({
        id,
        status: "ACTIVE",
        revision: 7,
      });
      await expect(admin.archive(id, 7)).resolves.toMatchObject({
        id,
        status: "ARCHIVED",
        revision: 7,
      });

      expect(fixture.requests.map(({ url }) => url)).toEqual([
        "/v1/admin/content/items/poem%2F%E8%AF%97%20%3F%26%23/validate",
        "/v1/admin/content/items/poem%2F%E8%AF%97%20%3F%26%23/activate?expectedRevision=7",
        "/v1/admin/content/items/poem%2F%E8%AF%97%20%3F%26%23/archive?expectedRevision=7",
      ]);
      expect(
        fixture.requests.every(
          ({ token, actor, contentType, body }) =>
            token === "secret-token" &&
            actor === undefined &&
            contentType === "application/json" &&
            body === "{}",
        ),
      ).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("applies 310 activations and 10 archives and writes the report", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const checklistOutput = { log: vi.fn(), error: vi.fn() };
    const applyOutput = { log: vi.fn(), error: vi.fn() };

    try {
      expect(
        await run(
          [
            "poem-review-checklist",
            "--in",
            fixture.candidatePath,
            "--out",
            fixture.checklistPath,
            "--summary",
            fixture.summaryPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "secret-token",
          ],
          {},
          checklistOutput,
        ),
      ).toBe(0);
      const checklistEntries = (await readFile(fixture.checklistPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { id: string });
      const adminToken = checklistEntries[0]!.id;
      fixture.requests.length = 0;

      const code = await run(
        [
          "apply-poem-review",
          "--in",
          fixture.checklistPath,
          "--report",
          fixture.reportPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          adminToken,
        ],
        {},
        applyOutput,
      );

      expect(code).toBe(0);
      const reportText = await readFile(fixture.reportPath, "utf8");
      expect(reportText.endsWith("\n")).toBe(true);
      const report = JSON.parse(reportText) as {
        activated: number;
        archived: number;
        skipped: number;
        failed: number;
        results: Array<{ id: string }>;
      };
      expect(report).toMatchObject({
        activated: 310,
        archived: 10,
        skipped: 0,
        failed: 0,
      });
      expect(report.results.map(({ id }) => id).sort()).toEqual(
        checklistEntries.map(({ id }) => id).sort(),
      );
      expect(report.results.some(({ id }) => id === adminToken)).toBe(true);
      const actionRequests = fixture.requests.filter(({ url }) =>
        /\/(activate|archive)\?/.test(url),
      );
      expect(actionRequests).toHaveLength(320);
      expect(
        actionRequests
          .slice(0, 10)
          .every(({ url }) => url.includes("/archive?")),
      ).toBe(true);
      expect(
        actionRequests.slice(10).every(({ url }) => url.includes("/activate?")),
      ).toBe(true);
      expect(actionRequests.every(({ body }) => body === "{}")).toBe(true);
      expect(
        actionRequests.filter(({ url }) => url.endsWith("?expectedRevision=1")),
      ).toHaveLength(316);
      expect(
        actionRequests.filter(({ url }) => url.endsWith("?expectedRevision=2")),
      ).toHaveLength(4);
      const hasActionRequest = (id: string, expectedRevision: number) =>
        actionRequests.some(
          ({ url }) =>
            url.includes(`/v1/admin/content/items/${id}/`) &&
            url.endsWith(`?expectedRevision=${expectedRevision}`),
        );
      expect(hasActionRequest("sc-gwd-45c396367f59", 1)).toBe(true);
      expect(
        TITLE_DISAMBIGUATED_CANDIDATE_IDS.every((id) =>
          hasActionRequest(id, 2),
        ),
      ).toBe(true);
      expect(applyOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(
          `activated=310 archived=10 skipped=0 failed=0 report=${fixture.reportPath}`,
        ),
      );
      expect(applyOutput.error).not.toHaveBeenCalled();
      expect(
        JSON.stringify([
          ...applyOutput.log.mock.calls,
          ...applyOutput.error.mock.calls,
        ]),
      ).not.toContain(adminToken);
      expect(
        fixture.requests.every(
          ({ token, actor, contentType }) =>
            token === adminToken &&
            actor === undefined &&
            contentType === "application/json",
        ),
      ).toBe(true);

      fixture.requests.length = 0;
      applyOutput.log.mockClear();
      const rerunCode = await run(
        [
          "apply-poem-review",
          "--in",
          fixture.checklistPath,
          "--report",
          fixture.reportPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          adminToken,
        ],
        {},
        applyOutput,
      );

      expect(rerunCode).toBe(0);
      expect(
        fixture.requests.filter(({ url }) =>
          /\/(activate|archive)\?/.test(url),
        ),
      ).toHaveLength(0);
      expect(
        JSON.parse(await readFile(fixture.reportPath, "utf8")),
      ).toMatchObject({
        activated: 0,
        archived: 0,
        skipped: 320,
        failed: 0,
      });
      expect(applyOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(
          `activated=0 archived=0 skipped=320 failed=0 report=${fixture.reportPath}`,
        ),
      );
      const rerunReport = JSON.parse(
        await readFile(fixture.reportPath, "utf8"),
      ) as { results: Array<{ id: string }> };
      expect(rerunReport.results.some(({ id }) => id === adminToken)).toBe(
        true,
      );
    } finally {
      await fixture.close();
    }
  });

  it.each(["report lock exists", "report directory is not writable"] as const)(
    "reserves the report channel before HTTP when %s",
    async (condition) => {
      const fixture = await createPoemReviewHttpFixture();
      const oldReport = "old report\n";
      const reportDirectory = join(fixture.reportPath, "..");
      const lockPath = `${fixture.reportPath}.lock`;
      let restoreDirectoryPermissions = false;

      try {
        expect(
          await run(
            [
              "poem-review-checklist",
              "--in",
              fixture.candidatePath,
              "--out",
              fixture.checklistPath,
              "--summary",
              fixture.summaryPath,
              "--admin-url",
              fixture.url,
              "--admin-token",
              "secret-token",
            ],
            {},
            { log: vi.fn(), error: vi.fn() },
          ),
        ).toBe(0);
        await mkdir(reportDirectory, { recursive: true });
        await writeFile(fixture.reportPath, oldReport);
        if (condition === "report lock exists") {
          await writeFile(lockPath, "held");
        } else {
          await chmod(reportDirectory, 0o500);
          restoreDirectoryPermissions = true;
        }
        fixture.requests.length = 0;
        const output = { log: vi.fn(), error: vi.fn() };

        const code = await run(
          [
            "apply-poem-review",
            "--in",
            fixture.checklistPath,
            "--report",
            fixture.reportPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "secret-token",
          ],
          {},
          output,
        );

        expect(code).toBe(1);
        expect(fixture.requests).toHaveLength(0);
        expect(await readFile(fixture.reportPath, "utf8")).toBe(oldReport);
        if (condition === "report lock exists") {
          expect(await readFile(lockPath, "utf8")).toBe("held");
        }
        expect(output.log).not.toHaveBeenCalled();
        expect(output.error).toHaveBeenCalledOnce();
      } finally {
        if (restoreDirectoryPermissions) {
          await chmod(reportDirectory, 0o700);
        }
        await fixture.close();
      }
    },
  );

  it("writes a redacted failure report atomically for an HTTP action error", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const checklistOutput = { log: vi.fn(), error: vi.fn() };
    const applyOutput = { log: vi.fn(), error: vi.fn() };
    const token = 'secret "\\/?&+=';
    const uriEncodedToken = encodeURIComponent(token);
    const search = new URLSearchParams();
    search.set("token", token);
    const formEncodedToken = search.toString().slice("token=".length);
    const jsonEscapedToken = JSON.stringify(token).slice(1, -1);
    const serializedEscapedToken = JSON.stringify(jsonEscapedToken).slice(
      1,
      -1,
    );

    try {
      expect(
        await run(
          [
            "poem-review-checklist",
            "--in",
            fixture.candidatePath,
            "--out",
            fixture.checklistPath,
            "--summary",
            fixture.summaryPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            token,
          ],
          {},
          checklistOutput,
        ),
      ).toBe(0);
      await mkdir(join(fixture.reportPath, ".."), { recursive: true });
      await writeFile(fixture.reportPath, "old report\n");
      fixture.requests.length = 0;
      fixture.failNextAction(
        503,
        JSON.stringify({
          error: `${token}|${uriEncodedToken}|${formEncodedToken}`,
        }),
      );

      const code = await run(
        [
          "apply-poem-review",
          "--in",
          fixture.checklistPath,
          "--report",
          fixture.reportPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          token,
        ],
        {},
        applyOutput,
      );

      expect(code).toBe(1);
      const reportText = await readFile(fixture.reportPath, "utf8");
      const report = JSON.parse(reportText) as {
        activated: number;
        archived: number;
        skipped: number;
        failed: number;
        failure: { phase: string; error: string };
      };
      expect(reportText).toBe(`${JSON.stringify(report, null, 2)}\n`);
      expect(report).toMatchObject({
        activated: 0,
        archived: 0,
        skipped: 0,
        failed: 1,
        failure: {
          phase: "archive",
        },
      });
      expect(report.failure.error).toContain("[REDACTED]");
      expect(reportText).not.toContain(token);
      expect(reportText).not.toContain(uriEncodedToken);
      expect(reportText).not.toContain(formEncodedToken);
      expect(reportText).not.toContain(jsonEscapedToken);
      expect(reportText).not.toContain(serializedEscapedToken);
      expect(applyOutput.log).not.toHaveBeenCalled();
      expect(applyOutput.error).toHaveBeenCalledWith(
        expect.stringContaining(
          `activated=0 archived=0 skipped=0 failed=1 report=${fixture.reportPath}`,
        ),
      );
      const outputText = JSON.stringify([
        ...applyOutput.log.mock.calls,
        ...applyOutput.error.mock.calls,
      ]);
      expect(outputText).toContain("[REDACTED]");
      expect(outputText).not.toContain(token);
      expect(outputText).not.toContain(uriEncodedToken);
      expect(outputText).not.toContain(formEncodedToken);
      expect(outputText).not.toContain(jsonEscapedToken);
      expect(outputText).not.toContain(serializedEscapedToken);
      expect((await readdir(join(fixture.reportPath, ".."))).sort()).toEqual([
        "report.json",
      ]);
      expect(
        fixture.requests.filter(({ url }) =>
          /\/(activate|archive)\?/.test(url),
        ),
      ).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("hides an unknown JSON error and performs no actions after preflight fails", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      expect(
        await run(
          [
            "poem-review-checklist",
            "--in",
            fixture.candidatePath,
            "--out",
            fixture.checklistPath,
            "--summary",
            fixture.summaryPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "secret-token",
          ],
          {},
          { log: vi.fn(), error: vi.fn() },
        ),
      ).toBe(0);
      fixture.requests.length = 0;
      fixture.invalidateNextValidation("secret-token is not JSON");

      const code = await run(
        [
          "apply-poem-review",
          "--in",
          fixture.checklistPath,
          "--report",
          fixture.reportPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      const reportText = await readFile(fixture.reportPath, "utf8");
      const report = JSON.parse(reportText) as {
        failed: number;
        failure: { phase: string; error: string };
      };
      expect(report).toMatchObject({
        failed: 1,
        failure: {
          phase: "preflight",
          error: expect.stringContaining("admin operation failed"),
        },
      });
      expect(reportText).not.toContain("secret-token");
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("admin operation failed"),
      );
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(
        "secret-token",
      );
      expect(
        fixture.requests.filter(({ url }) =>
          /\/(activate|archive)\?/.test(url),
        ),
      ).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it("redacts the request path when a successful response is not JSON", async () => {
    const fixture = await createPoemReviewHttpFixture();

    try {
      expect(
        await run(
          [
            "poem-review-checklist",
            "--in",
            fixture.candidatePath,
            "--out",
            fixture.checklistPath,
            "--summary",
            fixture.summaryPath,
            "--admin-url",
            fixture.url,
            "--admin-token",
            "setup-token",
          ],
          {},
          { log: vi.fn(), error: vi.fn() },
        ),
      ).toBe(0);
      const activateId = (await readFile(fixture.checklistPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { id: string; decision: string })
        .find(({ decision }) => decision === "ACTIVATE")!.id;
      fixture.invalidateNextValidation(`${activateId} response body`);
      const output = { log: vi.fn(), error: vi.fn() };

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          activateId,
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("[REDACTED]"),
      );
      expect(output.error.mock.calls[0]![0]).toContain("returned invalid JSON");
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(activateId);
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(
        "response body",
      );
    } finally {
      await fixture.close();
    }
  });

  it("does not expose a token from an invalid successful catalog response", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const oldChecklist = "old checklist\n";
    const oldSummary = "old summary\n";

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await mkdir(join(fixture.summaryPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await writeFile(fixture.summaryPath, oldSummary);
      fixture.invalidateNextList("secret-token is not JSON");

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(fixture.summaryPath, "utf8")).toBe(oldSummary);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledOnce();
      expect(output.error.mock.calls[0]![0]).toContain("invalid JSON");
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(
        "secret-token",
      );
    } finally {
      await fixture.close();
    }
  });

  it.each([
    { name: "page is null", page: null },
    {
      name: "items is not an array",
      page: { items: { secret: "secret-token" }, nextCursor: null },
    },
    {
      name: "nextCursor is missing",
      page: { items: [], secret: "secret-token" },
    },
    {
      name: "nextCursor is not a string or null",
      page: { items: [], nextCursor: 7, secret: "secret-token" },
    },
  ])("rejects a malformed catalog page when $name", async ({ page }) => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const oldChecklist = "old checklist\n";
    const oldSummary = "old summary\n";

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await mkdir(join(fixture.summaryPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await writeFile(fixture.summaryPath, oldSummary);
      fixture.invalidateNextList(JSON.stringify(page));

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(fixture.requests).toHaveLength(1);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(fixture.summaryPath, "utf8")).toBe(oldSummary);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("invalid content page"),
      );
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(
        "secret-token",
      );
    } finally {
      await fixture.close();
    }
  });

  it("rejects a repeated catalog cursor after two requests", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const token = "repeated cursor /?&";
    const oldChecklist = "old checklist\n";
    const oldSummary = "old summary\n";

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await mkdir(join(fixture.summaryPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await writeFile(fixture.summaryPath, oldSummary);
      fixture.repeatCatalogCursor(token);

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          token,
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(fixture.requests).toHaveLength(2);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(fixture.summaryPath, "utf8")).toBe(oldSummary);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("repeated content cursor"),
      );
      expect(JSON.stringify(output.error.mock.calls)).not.toContain(token);
    } finally {
      await fixture.close();
    }
  });

  it("keeps existing checklist files when paginated catalog generation fails", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const oldChecklist = "old checklist\n";
    const oldSummary = "old summary\n";

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await mkdir(join(fixture.summaryPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await writeFile(fixture.summaryPath, oldSummary);
      fixture.duplicateCatalogIdAcrossPages();

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(fixture.summaryPath, "utf8")).toBe(oldSummary);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalledWith(
        expect.stringContaining("duplicate poem ID"),
      );
      expect(await readdir(join(fixture.checklistPath, ".."))).toEqual([
        "review.ndjson",
      ]);
      expect(await readdir(join(fixture.summaryPath, ".."))).toEqual([
        "summary.md",
      ]);
    } finally {
      await fixture.close();
    }
  });

  it("does not remove an existing summary lock or replace the checklist", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const oldChecklist = "old checklist\n";
    const oldSummary = "old summary\n";
    const lockPath = `${fixture.summaryPath}.lock`;

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await mkdir(join(fixture.summaryPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await writeFile(fixture.summaryPath, oldSummary);
      await writeFile(lockPath, "held");

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(fixture.summaryPath, "utf8")).toBe(oldSummary);
      expect(await readFile(lockPath, "utf8")).toBe("held");
      expect((await readdir(join(fixture.summaryPath, ".."))).sort()).toEqual([
        "summary.md",
        "summary.md.lock",
      ]);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });

  it("cleans its lock and temporary file when an atomic rename fails", async () => {
    const fixture = await createPoemReviewHttpFixture();
    const output = { log: vi.fn(), error: vi.fn() };
    const oldChecklist = "old checklist\n";

    try {
      await mkdir(join(fixture.checklistPath, ".."), { recursive: true });
      await writeFile(fixture.checklistPath, oldChecklist);
      await mkdir(fixture.summaryPath, { recursive: true });
      await writeFile(join(fixture.summaryPath, "marker"), "keep");

      const code = await run(
        [
          "poem-review-checklist",
          "--in",
          fixture.candidatePath,
          "--out",
          fixture.checklistPath,
          "--summary",
          fixture.summaryPath,
          "--admin-url",
          fixture.url,
          "--admin-token",
          "secret-token",
        ],
        {},
        output,
      );

      expect(code).toBe(1);
      expect(await readFile(fixture.checklistPath, "utf8")).toBe(oldChecklist);
      expect(await readFile(join(fixture.summaryPath, "marker"), "utf8")).toBe(
        "keep",
      );
      expect(await readdir(join(fixture.summaryPath, ".."))).toEqual([
        "summary.md",
      ]);
      expect(output.log).not.toHaveBeenCalled();
      expect(output.error).toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });
});
