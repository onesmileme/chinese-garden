import type {
  AdminOperationsPort,
  ImportBatch,
} from "@cc/api-client";
import type { ParsedCandidates } from "./parse-candidates";

export interface ImportCheckpoint {
  batchId: string;
  nextChunkIndex: number;
  imported: number;
  skipped: number;
  rejected: number;
}

const CHUNK_SIZE = 1000;

export async function runCandidateImport(
  port: AdminOperationsPort,
  parsed: ParsedCandidates,
  checkpoint: ImportCheckpoint | null,
  onProgress: (checkpoint: ImportCheckpoint) => void,
): Promise<ImportBatch> {
  let current = checkpoint;
  if (current === null) {
    const batch = await port.createImport({
      ruleVersion: parsed.ruleVersion,
      candidateCount: parsed.candidates.length,
    });
    current = {
      batchId: batch.id,
      nextChunkIndex: 0,
      imported: 0,
      skipped: 0,
      rejected: 0,
    };
    onProgress(current);
  }

  const totalChunks = Math.ceil(parsed.candidates.length / CHUNK_SIZE);
  for (
    let chunkIndex = current.nextChunkIndex;
    chunkIndex < totalChunks;
    chunkIndex += 1
  ) {
    const start = chunkIndex * CHUNK_SIZE;
    const result = await port.appendImport(
      current.batchId,
      parsed.candidates.slice(start, start + CHUNK_SIZE),
    );
    current = {
      batchId: current.batchId,
      nextChunkIndex: chunkIndex + 1,
      imported: current.imported + result.imported,
      skipped: current.skipped + result.skipped,
      rejected: current.rejected + result.rejected,
    };
    onProgress(current);
  }

  return port.completeImport(current.batchId);
}
