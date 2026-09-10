import { constants, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  decodeTar,
  decodeTarGzip,
  RUNTIME_ARTIFACT_PATHS,
} from "../src/content/tar-gzip";

const runtimeEntries = () =>
  [...RUNTIME_ARTIFACT_PATHS].map((name) => ({
    name,
    data: new TextEncoder().encode("{}"),
  }));

describe("decodeTarGzip", () => {
  it("extracts the restricted runtime entries", async () => {
    const files = await decodeTarGzip(gzipSync(tar(runtimeEntries())));

    expect([...files.keys()]).toEqual([...RUNTIME_ARTIFACT_PATHS]);
  });

  it("rejects traversal paths", async () => {
    const bytes = gzipSync(
      tar([{ name: "../secret.json", data: new TextEncoder().encode("{}") }]),
    );

    await expect(decodeTarGzip(bytes)).rejects.toThrow(
      "invalid artifact path",
    );
  });

  it("rejects compressed input above the limit", async () => {
    await expect(
      decodeTarGzip(new Uint8Array(32 * 1024 * 1024 + 1)),
    ).rejects.toThrow("compressed artifact exceeds size limit");
  });

  it.each([
    ["stored", { level: 0 }],
    ["fixed", { strategy: constants.Z_FIXED }],
    ["dynamic", {}],
  ])("uses the portable %s DEFLATE fallback", async (_name, options) => {
    const original = globalThis.DecompressionStream;
    vi.stubGlobal("DecompressionStream", undefined);
    try {
      const files = await decodeTarGzip(
        gzipSync(tar(runtimeEntries()), options),
      );
      expect([...files.keys()]).toEqual([...RUNTIME_ARTIFACT_PATHS]);
    } finally {
      vi.stubGlobal("DecompressionStream", original);
    }
  });

  it("cancels decompression when expanded bytes exceed the limit", async () => {
    const originalBlob = globalThis.Blob;
    const originalDecompressionStream = globalThis.DecompressionStream;
    const cancel = vi.fn(async () => undefined);
    vi.stubGlobal(
      "Blob",
      class {
        stream() {
          return {
            pipeThrough: () => ({
              getReader: () => ({
                read: vi.fn(async () => ({
                  done: false,
                  value: { byteLength: 128 * 1024 * 1024 + 1 },
                })),
                cancel,
              }),
            }),
          };
        }
      },
    );
    vi.stubGlobal("DecompressionStream", class {});
    try {
      await expect(decodeTarGzip(new Uint8Array())).rejects.toThrow(
        "decompressed artifact exceeds size limit",
      );
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.stubGlobal("Blob", originalBlob);
      vi.stubGlobal("DecompressionStream", originalDecompressionStream);
    }
  });
});

describe("decodeTar", () => {
  it.each(["/absolute.json", "..\\secret.json", "unknown.json"])(
    "rejects unsafe or unknown path %s",
    (name) => {
      expect(() =>
        decodeTar(
          tar([{ name, data: new TextEncoder().encode("{}") }]),
        ),
      ).toThrow("invalid artifact path");
    },
  );

  it("rejects duplicate and non-regular entries", () => {
    const entries = runtimeEntries();
    expect(() => decodeTar(tar([...entries, entries[0]!]))).toThrow(
      "duplicate artifact path",
    );

    const directory = tar(entries);
    directory[156] = 53;
    expect(() => decodeTar(directory)).toThrow(
      "unsupported tar entry type",
    );
  });

  it("rejects invalid sizes and truncated entries", () => {
    const invalidSize = tar(runtimeEntries());
    invalidSize[124] = "x".charCodeAt(0);
    expect(() => decodeTar(invalidSize)).toThrow("invalid tar entry size");

    const truncated = tar(runtimeEntries());
    truncated.set(new TextEncoder().encode("77777777777\0"), 124);
    expect(() => decodeTar(truncated)).toThrow("truncated tar entry");
  });

  it("accepts a full-width octal size field without a null terminator", () => {
    const archive = tar(runtimeEntries());
    archive.set(new TextEncoder().encode("000000000002"), 124);

    expect(decodeTar(archive).size).toBe(RUNTIME_ARTIFACT_PATHS.size);
  });

  it("requires every runtime path and a clean end marker", () => {
    expect(() => decodeTar(tar(runtimeEntries().slice(1)))).toThrow(
      "missing artifact path",
    );

    const withoutEnd = tar(runtimeEntries()).slice(0, -1024);
    expect(() => decodeTar(withoutEnd)).toThrow("missing tar end marker");

    const trailing = tar(runtimeEntries());
    trailing[trailing.byteLength - 1] = 1;
    expect(() => decodeTar(trailing)).toThrow(
      "trailing data after tar end marker",
    );
  });
});

function tar(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode(entry.name), 0);
    header.set(new TextEncoder().encode("0000644\0"), 100);
    header.set(new TextEncoder().encode("0000000\0"), 108);
    header.set(new TextEncoder().encode("0000000\0"), 116);
    header.set(
      new TextEncoder().encode(
        `${entry.data.byteLength.toString(8).padStart(11, "0")}\0`,
      ),
      124,
    );
    header[156] = 48;
    chunks.push(header, entry.data);
    const padding = (512 - (entry.data.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
