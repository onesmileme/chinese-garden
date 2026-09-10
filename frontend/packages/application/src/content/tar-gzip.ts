import { gunzip } from "./gunzip";

const TAR_BLOCK_SIZE = 512;
const MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024;

export const RUNTIME_ARTIFACT_PATHS = new Set([
  "corpus/character-bank.json",
  "corpus/idiom-bank.json",
  "corpus/poem-bank.json",
  "curriculum/curriculum-v1.json",
  "rules/content-level-v1.json",
  "rules/mastery-v1.json",
  "rules/progression-v1.json",
]);

export async function decodeTarGzip(
  compressed: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  if (compressed.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error("compressed artifact exceeds size limit");
  }
  if (typeof DecompressionStream === "undefined") {
    return decodeTar(gunzip(compressed, MAX_DECOMPRESSED_BYTES));
  }
  const bytes = Uint8Array.from(compressed).buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  const tar = await readStream(stream, MAX_DECOMPRESSED_BYTES);
  return decodeTar(tar);
}

export function decodeTar(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let ended = false;
  while (offset + TAR_BLOCK_SIZE <= tar.byteLength) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      if (!tar.subarray(offset).every((byte) => byte === 0)) {
        throw new Error("trailing data after tar end marker");
      }
      ended = true;
      break;
    }
    const name = readText(header.subarray(0, 100));
    const type = header[156];
    const size = readOctal(header.subarray(124, 136));
    if (
      name === "" ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      !RUNTIME_ARTIFACT_PATHS.has(name)
    ) {
      throw new Error(`invalid artifact path: ${name}`);
    }
    if (type !== 0 && type !== 48) {
      throw new Error(`unsupported tar entry type: ${type}`);
    }
    if (files.has(name)) {
      throw new Error(`duplicate artifact path: ${name}`);
    }
    const start = offset + TAR_BLOCK_SIZE;
    const end = start + size;
    if (end > tar.byteLength) {
      throw new Error(`truncated tar entry: ${name}`);
    }
    files.set(name, tar.slice(start, end));
    offset = start + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }
  if (!ended) {
    throw new Error("missing tar end marker");
  }
  for (const required of RUNTIME_ARTIFACT_PATHS) {
    if (!files.has(required)) {
      throw new Error(`missing artifact path: ${required}`);
    }
  }
  return files;
}

function readText(bytes: Uint8Array): string {
  const zero = bytes.indexOf(0);
  return new TextDecoder().decode(zero < 0 ? bytes : bytes.subarray(0, zero));
}

function readOctal(bytes: Uint8Array): number {
  const value = readText(bytes).trim();
  if (!/^[0-7]+$/.test(value)) {
    throw new Error("invalid tar entry size");
  }
  const size = Number.parseInt(value, 8);
  return size;
}

async function readStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("decompressed artifact exceeds size limit");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
