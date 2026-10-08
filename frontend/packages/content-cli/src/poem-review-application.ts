import {
  PoemReviewAdminError,
  type PoemReviewAdminPort,
} from "./poem-review-admin";
import {
  canonicalJsonSha256,
  poemIdentity,
  sha256Text,
} from "./poem-identity";
import {
  type AdminPoemItem,
  type PoemReviewEntry,
  classifyPoemReview,
  finalizePoemReview,
  parsePoemReview,
  serializePoemReview,
  serializePoemReviewSummary,
  type ValidationResponse,
} from "./poem-review";

export interface GeneratedPoemReview {
  entries: PoemReviewEntry[];
  checklistText: string;
  summaryText: string;
}

export interface PoemReviewExecutionResult {
  id: string;
  decision: PoemReviewEntry["decision"];
  result: "ACTIVATED" | "ARCHIVED" | "SKIPPED_ALREADY_APPLIED" | "FAILED";
  error?: string;
}

export interface PoemReviewExecutionReport {
  checklistSha256: string;
  startedAt: string;
  finishedAt: string;
  activated: number;
  archived: number;
  skipped: number;
  failed: number;
  results: PoemReviewExecutionResult[];
  failure?: {
    phase:
      | "checklist"
      | "preflight catalog"
      | "preflight"
      | "archive"
      | "activate"
      | "postflight catalog"
      | "postflight verification";
    id?: string;
    error: string;
  };
  verification?: {
    activePoems: number;
    activeCandidates: number;
    archivedCandidates: number;
    draftCandidates: number;
    duplicateActiveGroups: number;
  };
}

export class PoemReviewExecutionError extends Error {
  constructor(
    message: string,
    readonly report: PoemReviewExecutionReport,
  ) {
    super(message);
    this.name = "PoemReviewExecutionError";
  }
}

export async function generatePoemReview(input: {
  candidateText: string;
  expectedCandidateSha256: string;
  admin: PoemReviewAdminPort;
}): Promise<GeneratedPoemReview> {
  const catalog = await input.admin.listPoems();
  const classified = classifyPoemReview({
    candidateText: input.candidateText,
    catalog,
    expectedCandidateSha256: input.expectedCandidateSha256,
  });
  const validationById = new Map<string, ValidationResponse>();
  for (const entry of classified.entries) {
    if (entry.decision === "ACTIVATE") {
      validationById.set(entry.id, await input.admin.validate(entry.id));
    }
  }
  const entries = finalizePoemReview(classified, validationById);
  const checklistText = serializePoemReview(entries);
  return {
    entries,
    checklistText,
    summaryText: serializePoemReviewSummary(
      entries,
      sha256Text(input.candidateText),
      sha256Text(checklistText),
    ),
  };
}

function findItem(
  catalog: readonly AdminPoemItem[],
  id: string,
): AdminPoemItem | undefined {
  return catalog.find((item) => item.id === id);
}

function duplicateActiveGroupCount(
  catalog: readonly AdminPoemItem[],
): number {
  const counts = new Map<string, number>();
  for (const item of catalog) {
    if (item.type !== "POEM" || item.status !== "ACTIVE") continue;
    const identity = poemIdentity(item.payload.author, item.payload.lines);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function failExecution(
  report: PoemReviewExecutionReport,
  now: () => Date,
  entry: PoemReviewEntry,
  error: string,
  phase: "preflight" | "archive" | "activate" = "preflight",
): never {
  report.failed = 1;
  report.failure = {
    phase,
    id: entry.id,
    error,
  };
  report.finishedAt = now().toISOString();
  report.results.push({
    id: entry.id,
    decision: entry.decision,
    result: "FAILED",
    error,
  });
  throw new PoemReviewExecutionError(error, report);
}

function failPhase(
  report: PoemReviewExecutionReport,
  now: () => Date,
  phase: "checklist" | "preflight catalog" | "postflight catalog",
  error: unknown,
): never {
  const message = `${phase}: ${errorMessage(error)}`;
  report.failed = 1;
  report.failure = {
    phase,
    error: message,
  };
  report.finishedAt = now().toISOString();
  throw new PoemReviewExecutionError(message, report);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function adminErrorMessage(error: unknown): string {
  return error instanceof PoemReviewAdminError
    ? error.message
    : "admin operation failed";
}

function assertActionResponse(
  response: AdminPoemItem,
  entry: PoemReviewEntry,
  targetStatus: "ACTIVE" | "ARCHIVED",
): void {
  if (typeof response !== "object" || response === null) {
    throw new Error("malformed action response");
  }
  if (response.id !== entry.id) {
    throw new Error("action response ID does not match");
  }
  if (response.type !== "POEM") {
    throw new Error("action response type must be POEM");
  }
  if (response.status !== targetStatus) {
    throw new Error(`action response status must be ${targetStatus}`);
  }
  if (response.revision !== entry.expectedRevision) {
    throw new Error("action response revision does not match");
  }
  if (canonicalJsonSha256(response.payload) !== entry.payloadHash) {
    throw new Error("action response payload does not match");
  }
}

export async function applyPoemReview(input: {
  checklistText: string;
  admin: PoemReviewAdminPort;
  now: () => Date;
}): Promise<PoemReviewExecutionReport> {
  const startedAt = input.now().toISOString();
  const report: PoemReviewExecutionReport = {
    checklistSha256: sha256Text(input.checklistText),
    startedAt,
    finishedAt: startedAt,
    activated: 0,
    archived: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };
  let entries: PoemReviewEntry[];
  try {
    entries = parsePoemReview(input.checklistText);
  } catch (error) {
    failPhase(report, input.now, "checklist", error);
  }
  let catalog: AdminPoemItem[];
  try {
    catalog = await input.admin.listPoems();
  } catch (error) {
    failPhase(
      report,
      input.now,
      "preflight catalog",
      adminErrorMessage(error),
    );
  }
  const checklistCandidateIds = entries.map(({ id }) => id).sort();
  const backendCandidateIds = catalog
    .filter(({ id }) => id.startsWith("sc-gwd-"))
    .map(({ id }) => id)
    .sort();
  if (
    backendCandidateIds.length !== checklistCandidateIds.length ||
    backendCandidateIds.some(
      (id, index) => id !== checklistCandidateIds[index],
    )
  ) {
    failPhase(
      report,
      input.now,
      "preflight catalog",
      new Error("candidate IDs do not exactly match checklist"),
    );
  }

  for (const entry of entries) {
    const item = findItem(catalog, entry.id)!;
    if (item.type !== "POEM") {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: type must be POEM`,
      );
    }
    const targetStatus =
      entry.decision === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
    if (item.status !== entry.expectedStatus && item.status !== targetStatus) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: status does not match checklist or target`,
      );
    }
    if (item.revision !== entry.expectedRevision) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: revision does not match checklist`,
      );
    }
    if (canonicalJsonSha256(item.payload) !== entry.payloadHash) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: payload does not match checklist`,
      );
    }
    const identityHash = sha256Text(
      poemIdentity(item.payload.author, item.payload.lines),
    );
    if (identityHash !== entry.poemIdentityHash) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: identity does not match checklist`,
      );
    }
  }

  for (const entry of entries) {
    if (entry.decision !== "ARCHIVE_DUPLICATE") continue;
    const duplicate = findItem(catalog, entry.duplicateOf!);
    if (
      duplicate === undefined ||
      duplicate.type !== "POEM" ||
      duplicate.status !== "ACTIVE"
    ) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: duplicate target is missing or not ACTIVE`,
      );
    }
    const duplicateIdentityHash = sha256Text(
      poemIdentity(duplicate.payload.author, duplicate.payload.lines),
    );
    if (duplicateIdentityHash !== entry.poemIdentityHash) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: duplicate target identity does not match`,
      );
    }
  }

  const validationById = new Map<string, ValidationResponse>();
  for (const entry of entries) {
    if (entry.decision === "ACTIVATE") {
      try {
        validationById.set(entry.id, await input.admin.validate(entry.id));
      } catch (error) {
        failExecution(
          report,
          input.now,
          entry,
          `preflight ${entry.id}: ${adminErrorMessage(error)}`,
        );
      }
    }
  }
  for (const entry of entries) {
    if (entry.decision !== "ACTIVATE") continue;
    const validation = validationById.get(entry.id);
    if (
      validation?.valid !== true ||
      !Array.isArray(validation.issues) ||
      validation.issues.length !== 0
    ) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: validation failed`,
      );
    }
  }

  const orderedEntries = [
    ...entries.filter(({ decision }) => decision === "ARCHIVE_DUPLICATE"),
    ...entries.filter(({ decision }) => decision === "ACTIVATE"),
  ];
  for (const entry of orderedEntries) {
    const current = findItem(catalog, entry.id)!;
    const targetStatus =
      entry.decision === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
    if (current.status === targetStatus) {
      report.skipped += 1;
      report.results.push({
        id: entry.id,
        decision: entry.decision,
        result: "SKIPPED_ALREADY_APPLIED",
      });
      continue;
    }
    if (entry.decision === "ARCHIVE_DUPLICATE") {
      let response: AdminPoemItem;
      try {
        response = await input.admin.archive(
          entry.id,
          entry.expectedRevision,
        );
      } catch (error) {
        failExecution(
          report,
          input.now,
          entry,
          `archive ${entry.id}: ${adminErrorMessage(error)}`,
          "archive",
        );
      }
      try {
        assertActionResponse(response, entry, "ARCHIVED");
      } catch (error) {
        failExecution(
          report,
          input.now,
          entry,
          `archive ${entry.id}: ${errorMessage(error)}`,
          "archive",
        );
      }
      report.archived += 1;
      report.results.push({
        id: entry.id,
        decision: entry.decision,
        result: "ARCHIVED",
      });
    } else {
      let response: AdminPoemItem;
      try {
        response = await input.admin.activate(
          entry.id,
          entry.expectedRevision,
        );
      } catch (error) {
        failExecution(
          report,
          input.now,
          entry,
          `activate ${entry.id}: ${adminErrorMessage(error)}`,
          "activate",
        );
      }
      try {
        assertActionResponse(response, entry, "ACTIVE");
      } catch (error) {
        failExecution(
          report,
          input.now,
          entry,
          `activate ${entry.id}: ${errorMessage(error)}`,
          "activate",
        );
      }
      report.activated += 1;
      report.results.push({
        id: entry.id,
        decision: entry.decision,
        result: "ACTIVATED",
      });
    }
  }

  let finalCatalog: AdminPoemItem[];
  try {
    finalCatalog = await input.admin.listPoems();
  } catch (error) {
    failPhase(
      report,
      input.now,
      "postflight catalog",
      adminErrorMessage(error),
    );
  }
  const candidates = finalCatalog.filter(({ id }) => id.startsWith("sc-gwd-"));
  report.verification = {
    activePoems: finalCatalog.filter(
      ({ type, status }) => type === "POEM" && status === "ACTIVE",
    ).length,
    activeCandidates: candidates.filter(({ status }) => status === "ACTIVE")
      .length,
    archivedCandidates: candidates.filter(
      ({ status }) => status === "ARCHIVED",
    ).length,
    draftCandidates: candidates.filter(({ status }) => status === "DRAFT")
      .length,
    duplicateActiveGroups: duplicateActiveGroupCount(finalCatalog),
  };
  report.finishedAt = input.now().toISOString();
  if (
    report.verification.activePoems !== 333 ||
    report.verification.activeCandidates !== 310 ||
    report.verification.archivedCandidates !== 10 ||
    report.verification.draftCandidates !== 0 ||
    report.verification.duplicateActiveGroups !== 0
  ) {
    report.failed = 1;
    report.failure = {
      phase: "postflight verification",
      error: "postflight verification failed",
    };
    throw new PoemReviewExecutionError(
      "postflight verification failed",
      report,
    );
  }
  return report;
}
