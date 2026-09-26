import { describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { run } from "../src/bin";

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
      await readFile(join(contentRoot, "staging", "poems-x.draft.json"), "utf8"),
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
      await readFile(join(contentRoot, "staging", "idioms-x.draft.json"), "utf8"),
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
    const ndjson = await readFile(join(stagingDir, "candidates.ndjson"), "utf8");
    const lines = ndjson.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(3); // 2 chars + 1 idiom + 1 poem

    const candidates = lines.map((l) => JSON.parse(l));
    const chars = candidates.filter((c: any) => c.type === "CHARACTER");
    expect(chars.length).toBe(2);
    expect(chars.map((candidate: any) => candidate.payload.char).sort()).toEqual(
      ["你", "好"].sort(),
    );

    const idioms = candidates.filter((c: any) => c.type === "IDIOM");
    expect(idioms.length).toBe(1);

    const poems = candidates.filter((c: any) => c.type === "POEM");
    expect(poems.length).toBe(1);

    // Verify report
    const report = JSON.parse(await readFile(join(stagingDir, "report.json"), "utf8"));
    expect(report.ruleVersion).toBe("raw-corpus-v1");
    expect(report.totals.output).toBe(4);

    // Verify manifest
    const manifest = JSON.parse(await readFile(join(stagingDir, "manifest.json"), "utf8"));
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

    // Write a minimal NDJSON with 2 candidates
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
        payload: { char: "你", pinyin: "nǐ", imageId: "img-你", theme: "world", strokes: 7 },
      }) +
        "\n" +
        JSON.stringify({
          importKey: "XINHUA_WORD:word:好",
          source: "XINHUA_WORD",
          sourceRef: "xinhua/word.json:好",
          sourceHash: "def456",
          ruleVersion: "raw-corpus-v1",
          id: "hz-hao-好",
          type: "CHARACTER",
          suggestedLevel: 1,
          suggestedDifficulty: 1,
          score: 8,
          tags: [],
          payload: { char: "好", pinyin: "hǎo", imageId: "img-好", theme: "world", strokes: 6 },
        }) +
        "\n",
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
    expect(requests[0]!.body).toMatchObject({
      ruleVersion: "raw-corpus-v1",
      characters: 2,
    });

    expect(requests[1]).toMatchObject({
      method: "POST",
      path: "/v1/admin/content-imports/batch-1/candidates",
    });
    expect(requests[1]!.body).toHaveLength(2);

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
        payload: { char: "你", pinyin: "nǐ", imageId: "img-你", theme: "world", strokes: 7 },
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
    await writeFile(
      sourcePath,
      "一心一意\t100\n山高水长\t30\n春夏秋冬\t20\n",
    );
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
    { name: "restores an existing candidate", original: "original candidate\n" },
  ])(
    "$name when the manifest rename fails",
    async ({ original }) => {
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
    },
  );

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
  ])("rejects $name without leaving output files", async ({ change, message }) => {
    const fixture = await createFixture();
    const output = { log: vi.fn(), error: vi.fn() };

    try {
      const code = await run(change(commandArgs(fixture)), {}, output);

      expect(code).toBe(2);
      expect(output.error).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(output.log).not.toHaveBeenCalled();
      await expectNoOutputFiles(fixture.outputDirectory);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

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
