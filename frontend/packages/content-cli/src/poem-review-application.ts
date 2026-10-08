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

interface CatalogItem {
  id: string;
  type: "POEM";
  status: AdminPoemItem["status"];
  revision: number;
  payloadHash: string;
  poemIdentityHash: string;
}

interface CatalogSnapshot {
  items: CatalogItem[];
  byId: Map<string, CatalogItem>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCatalogSnapshot(value: unknown): CatalogSnapshot {
  if (!Array.isArray(value)) {
    throw new Error("catalog must be an array");
  }

  const items: CatalogItem[] = [];
  const byId = new Map<string, CatalogItem>();
  for (let index = 0; index < value.length; index += 1) {
    const context = `catalog[${index}]`;
    const rawItem: unknown = value[index];
    if (!isRecord(rawItem)) {
      throw new Error(`${context} must be an object`);
    }
    if (typeof rawItem.id !== "string" || rawItem.id.length === 0) {
      throw new Error(`${context}.id must be a non-empty string`);
    }
    if (byId.has(rawItem.id)) {
      throw new Error(`catalog contains duplicate ID ${rawItem.id}`);
    }
    if (rawItem.type !== "POEM") {
      throw new Error(`${context}.type must be POEM`);
    }
    if (
      rawItem.status !== "DRAFT" &&
      rawItem.status !== "ACTIVE" &&
      rawItem.status !== "ARCHIVED"
    ) {
      throw new Error(`${context}.status is invalid`);
    }
    if (
      typeof rawItem.revision !== "number" ||
      !Number.isInteger(rawItem.revision) ||
      rawItem.revision < 0
    ) {
      throw new Error(`${context}.revision must be a non-negative integer`);
    }
    if (!isRecord(rawItem.payload)) {
      throw new Error(`${context}.payload must be an object`);
    }
    if (typeof rawItem.payload.author !== "string") {
      throw new Error(`${context}.payload.author must be a string`);
    }
    if (!Array.isArray(rawItem.payload.lines)) {
      throw new Error(`${context}.payload.lines must be an array`);
    }
    const lines: string[] = [];
    for (
      let lineIndex = 0;
      lineIndex < rawItem.payload.lines.length;
      lineIndex += 1
    ) {
      const line: unknown = rawItem.payload.lines[lineIndex];
      if (typeof line !== "string") {
        throw new Error(
          `${context}.payload.lines[${lineIndex}] must be a string`,
        );
      }
      lines.push(line);
    }
    let payloadHash: string;
    try {
      payloadHash = canonicalJsonSha256(rawItem.payload);
    } catch {
      throw new Error(`${context}.payload is not canonical JSON`);
    }
    const item: CatalogItem = {
      id: rawItem.id,
      type: rawItem.type,
      status: rawItem.status,
      revision: rawItem.revision,
      payloadHash,
      poemIdentityHash: sha256Text(
        poemIdentity(rawItem.payload.author, lines),
      ),
    };
    items.push(item);
    byId.set(item.id, item);
  }
  return { items, byId };
}

function duplicateActiveGroupCount(
  catalog: readonly CatalogItem[],
): number {
  const counts = new Map<string, number>();
  for (const item of catalog) {
    if (item.type !== "POEM" || item.status !== "ACTIVE") continue;
    counts.set(
      item.poemIdentityHash,
      (counts.get(item.poemIdentityHash) ?? 0) + 1,
    );
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

function failPostflightEntry(
  report: PoemReviewExecutionReport,
  now: () => Date,
  entry: PoemReviewEntry,
  detail: string,
): never {
  const error = `postflight ${entry.id}: ${detail}`;
  report.failed = 1;
  report.failure = {
    phase: "postflight verification",
    id: entry.id,
    error,
  };
  report.finishedAt = now().toISOString();
  throw new PoemReviewExecutionError(error, report);
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
  let rawCatalog: AdminPoemItem[];
  try {
    rawCatalog = await input.admin.listPoems();
  } catch (error) {
    failPhase(
      report,
      input.now,
      "preflight catalog",
      adminErrorMessage(error),
    );
  }
  let catalog: CatalogSnapshot;
  try {
    catalog = parseCatalogSnapshot(rawCatalog);
  } catch (error) {
    failPhase(report, input.now, "preflight catalog", error);
  }
  const reviewedItems: Array<{
    entry: PoemReviewEntry;
    item: CatalogItem;
  }> = [];
  let missingChecklistItem = false;
  for (const entry of entries) {
    const item = catalog.byId.get(entry.id);
    if (item === undefined) {
      missingChecklistItem = true;
      continue;
    }
    reviewedItems.push({ entry, item });
  }

  const checklistCandidateIds = entries.map(({ id }) => id).sort();
  const backendCandidateIds = catalog.items
    .filter(({ id }) => id.startsWith("sc-gwd-"))
    .map(({ id }) => id)
    .sort();
  if (
    missingChecklistItem ||
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

  for (const { entry, item } of reviewedItems) {
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
    if (item.payloadHash !== entry.payloadHash) {
      failExecution(
        report,
        input.now,
        entry,
        `preflight ${entry.id}: payload does not match checklist`,
      );
    }
    if (item.poemIdentityHash !== entry.poemIdentityHash) {
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
    const duplicate = catalog.byId.get(String(entry.duplicateOf));
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
    if (duplicate.poemIdentityHash !== entry.poemIdentityHash) {
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

  const orderedItems = [
    ...reviewedItems.filter(
      ({ entry }) => entry.decision === "ARCHIVE_DUPLICATE",
    ),
    ...reviewedItems.filter(({ entry }) => entry.decision === "ACTIVATE"),
  ];
  for (const { entry, item: current } of orderedItems) {
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

  let rawFinalCatalog: AdminPoemItem[];
  try {
    rawFinalCatalog = await input.admin.listPoems();
  } catch (error) {
    failPhase(
      report,
      input.now,
      "postflight catalog",
      adminErrorMessage(error),
    );
  }
  let finalCatalog: CatalogSnapshot;
  try {
    finalCatalog = parseCatalogSnapshot(rawFinalCatalog);
  } catch (error) {
    failPhase(report, input.now, "postflight catalog", error);
  }

  for (const entry of entries) {
    const item = finalCatalog.byId.get(entry.id);
    if (item === undefined) {
      failPostflightEntry(report, input.now, entry, "item is missing");
    }
    const targetStatus =
      entry.decision === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
    if (item.status !== targetStatus) {
      failPostflightEntry(
        report,
        input.now,
        entry,
        `status must be ${targetStatus}`,
      );
    }
    if (item.revision !== entry.expectedRevision) {
      failPostflightEntry(
        report,
        input.now,
        entry,
        "revision does not match checklist",
      );
    }
    if (item.poemIdentityHash !== entry.poemIdentityHash) {
      failPostflightEntry(
        report,
        input.now,
        entry,
        "identity does not match checklist",
      );
    }
    if (item.payloadHash !== entry.payloadHash) {
      failPostflightEntry(
        report,
        input.now,
        entry,
        "payload does not match checklist",
      );
    }
  }

  for (const entry of entries) {
    if (entry.decision !== "ARCHIVE_DUPLICATE") continue;
    const duplicate = finalCatalog.byId.get(String(entry.duplicateOf));
    if (duplicate === undefined || duplicate.status !== "ACTIVE") {
      failPostflightEntry(
        report,
        input.now,
        entry,
        "duplicate target is missing or not ACTIVE",
      );
    }
    if (duplicate.poemIdentityHash !== entry.poemIdentityHash) {
      failPostflightEntry(
        report,
        input.now,
        entry,
        "duplicate target identity does not match",
      );
    }
  }

  const candidates = finalCatalog.items.filter(
    ({ id }) => id.startsWith("sc-gwd-"),
  );
  report.verification = {
    activePoems: finalCatalog.items.filter(
      ({ type, status }) => type === "POEM" && status === "ACTIVE",
    ).length,
    activeCandidates: candidates.filter(({ status }) => status === "ACTIVE")
      .length,
    archivedCandidates: candidates.filter(
      ({ status }) => status === "ARCHIVED",
    ).length,
    draftCandidates: candidates.filter(({ status }) => status === "DRAFT")
      .length,
    duplicateActiveGroups: duplicateActiveGroupCount(finalCatalog.items),
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
