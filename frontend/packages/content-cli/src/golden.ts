import type { ValidationIssue } from "./model";
import type { Runner } from "./ports";

function failedIssue(
  stage: ValidationIssue["stage"],
  path: string,
  code: string,
  result: { code: number; stderr: string },
): ValidationIssue | null {
  if (result.code === 0) {
    return null;
  }
  return {
    stage,
    path,
    code,
    message: result.stderr.trim() || `exit code ${result.code}`,
  };
}

export async function runGoldenChecks(
  runner: Runner,
  repoRoot: string,
): Promise<ValidationIssue[]> {
  const frontend = await runner.exec(
    "pnpm",
    ["--dir", "frontend", "run", "test:cov"],
    repoRoot,
  );
  const backend = await runner.exec(
    "mvn",
    ["-f", "backend/pom.xml", "verify"],
    repoRoot,
  );
  const issues = [
    failedIssue("GOLDEN_TS", "frontend", "GOLDEN_TS_FAILED", frontend),
    failedIssue("GOLDEN_JAVA", "backend", "GOLDEN_JAVA_FAILED", backend),
  ];
  return issues.filter((issue): issue is ValidationIssue => issue !== null);
}
