import { describe, expect, it } from "vitest";
import { runGoldenChecks } from "../src/golden";
import type { Runner } from "../src/ports";

function runner(
  resultFor: (command: string) => { code: number; stderr: string },
): { calls: Array<{ command: string; args: string[]; cwd: string }>; runner: Runner } {
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  return {
    calls,
    runner: {
      async exec(command, args, cwd) {
        calls.push({ command, args, cwd });
        const result = resultFor(command);
        return { ...result, stdout: "" };
      },
    },
  };
}

describe("runGoldenChecks", () => {
  it("runs the frontend coverage and backend verify commands from repo root", async () => {
    const fake = runner(() => ({ code: 0, stderr: "" }));

    await expect(runGoldenChecks(fake.runner, "/repo")).resolves.toEqual([]);

    expect(fake.calls).toEqual([
      {
        command: "pnpm",
        args: ["--dir", "frontend", "run", "test:cov"],
        cwd: "/repo",
      },
      {
        command: "mvn",
        args: ["-f", "backend/pom.xml", "verify"],
        cwd: "/repo",
      },
    ]);
  });

  it("reports each failed command with its trimmed stderr or exit code", async () => {
    const fake = runner((command) =>
      command === "pnpm"
        ? { code: 1, stderr: "  TypeScript vectors differ\n" }
        : { code: 2, stderr: "" },
    );

    await expect(runGoldenChecks(fake.runner, "/repo")).resolves.toEqual([
      {
        stage: "GOLDEN_TS",
        path: "frontend",
        code: "GOLDEN_TS_FAILED",
        message: "TypeScript vectors differ",
      },
      {
        stage: "GOLDEN_JAVA",
        path: "backend",
        code: "GOLDEN_JAVA_FAILED",
        message: "exit code 2",
      },
    ]);
  });
});
