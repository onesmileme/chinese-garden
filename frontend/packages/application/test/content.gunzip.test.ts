import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { gunzip } from "../src/content/gunzip";

class BitWriter {
  private readonly bytes: number[] = [];
  private offset = 0;

  write(value: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const byteIndex = this.offset >>> 3;
      this.bytes[byteIndex] ??= 0;
      this.bytes[byteIndex]! |= ((value >>> index) & 1) << (this.offset & 7);
      this.offset += 1;
    }
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function reverseBits(value: number, length: number): number {
  let reversed = 0;
  for (let index = 0; index < length; index += 1) {
    reversed = (reversed << 1) | ((value >>> index) & 1);
  }
  return reversed;
}

function codes(lengths: readonly number[]): Array<[number, number]> {
  const maximum = Math.max(...lengths);
  const counts = new Array<number>(maximum + 1).fill(0);
  for (const length of lengths) {
    if (length > 0) counts[length] = counts[length]! + 1;
  }
  const next = new Array<number>(maximum + 1).fill(0);
  let code = 0;
  for (let length = 1; length <= maximum; length += 1) {
    code = (code + counts[length - 1]!) << 1;
    next[length] = code;
  }
  return lengths.map((length) => {
    if (length === 0) return [0, 0];
    const canonical = next[length]!;
    next[length] = canonical + 1;
    return [reverseBits(canonical, length), length];
  });
}

const fixedLiteralLengths = Array.from({ length: 288 }, (_, symbol) =>
  symbol <= 143 ? 8 : symbol <= 255 ? 9 : symbol <= 279 ? 7 : 8,
);
const fixedLiteralCodes = codes(fixedLiteralLengths);
const fixedDistanceCodes = codes(Array.from({ length: 32 }, () => 5));

function fixedStream(
  literalSymbols: readonly number[],
  distanceSymbol?: number,
): Uint8Array {
  const writer = new BitWriter();
  writer.write(1, 1);
  writer.write(1, 2);
  for (const symbol of literalSymbols) {
    const [code, length] = fixedLiteralCodes[symbol]!;
    writer.write(code, length);
  }
  if (distanceSymbol !== undefined) {
    const [code, length] = fixedDistanceCodes[distanceSymbol]!;
    writer.write(code, length);
  }
  return writer.finish();
}

function gzip(deflate: Uint8Array, outputSize = 0, flags = 0): Uint8Array {
  const header = Uint8Array.from([
    0x1f, 0x8b, 8, flags, 0, 0, 0, 0, 0, 255,
  ]);
  const trailer = new Uint8Array(8);
  new DataView(trailer.buffer).setUint32(4, outputSize, true);
  const result = new Uint8Array(header.length + deflate.length + trailer.length);
  result.set(header);
  result.set(deflate, header.length);
  result.set(trailer, header.length + deflate.length);
  return result;
}

function withOptionalHeader(source: Uint8Array): Uint8Array {
  const body = source.subarray(10, source.length - 8);
  const trailer = source.subarray(source.length - 8);
  const optional = Uint8Array.from([
    0, 0,
    102, 0,
    99, 0,
    0, 0,
  ]);
  const header = Uint8Array.from([
    0x1f, 0x8b, 8, 4 | 8 | 16 | 2, 0, 0, 0, 0, 0, 255,
  ]);
  const result = new Uint8Array(
    header.length + optional.length + body.length + trailer.length,
  );
  result.set(header);
  result.set(optional, header.length);
  result.set(body, header.length + optional.length);
  result.set(trailer, header.length + optional.length + body.length);
  return result;
}

describe("portable gunzip", () => {
  it("accepts optional extra, name, comment, and header CRC fields", () => {
    const source = gzipSync(new TextEncoder().encode("portable"));

    expect(
      new TextDecoder().decode(gunzip(withOptionalHeader(source), 1024)),
    ).toBe("portable");
  });

  it("grows its output buffer and enforces the configured limit", () => {
    const source = gzipSync(new Uint8Array(40_000).fill(7));

    expect(gunzip(source, 40_000)).toHaveLength(40_000);
    expect(() => gunzip(source, 39_999)).toThrow(
      "decompressed artifact exceeds size limit",
    );
  });

  it.each([
    new Uint8Array(),
    new Uint8Array(18),
    Uint8Array.from([
      0x1f, 0x8b, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]),
  ])("rejects invalid gzip headers", (source) => {
    expect(() => gunzip(source, 1024)).toThrow("invalid gzip header");
  });

  it("rejects reserved flags and malformed optional headers", () => {
    const reserved = gzip(Uint8Array.from([3, 0]), 0, 0x20);
    expect(() => gunzip(reserved, 1024)).toThrow("invalid gzip flags");

    const truncatedExtra = gzip(Uint8Array.from([3, 0]), 0, 4);
    expect(() => gunzip(truncatedExtra.subarray(0, 18), 1024)).toThrow(
      "invalid gzip header",
    );
    truncatedExtra[10] = 255;
    truncatedExtra[11] = 255;
    expect(() => gunzip(truncatedExtra, 1024)).toThrow("invalid gzip header");

    const unterminatedName = gzip(Uint8Array.from([3, 0]), 0, 8);
    unterminatedName.fill(1, 10);
    expect(() => gunzip(unterminatedName, 1024)).toThrow(
      "invalid gzip header",
    );

    const missingHeaderCrc = gzip(Uint8Array.from([3, 0]), 0, 2);
    expect(() => gunzip(missingHeaderCrc.subarray(0, 18), 1024)).toThrow(
      "invalid gzip header",
    );
  });

  it("rejects truncated and invalid stored blocks", () => {
    expect(() => gunzip(gzip(new Uint8Array()), 1024)).toThrow(
      "unexpected end of DEFLATE stream",
    );
    expect(() => gunzip(gzip(Uint8Array.from([1])), 1024)).toThrow(
      "unexpected end of DEFLATE stream",
    );
    expect(() =>
      gunzip(gzip(Uint8Array.from([1, 1, 0, 0, 0])), 1024),
    ).toThrow("invalid stored DEFLATE block");
    expect(() =>
      gunzip(gzip(Uint8Array.from([1, 2, 0, 0xfd, 0xff, 1])), 1024),
    ).toThrow("unexpected end of DEFLATE stream");
  });

  it("rejects invalid block, length, and distance symbols", () => {
    expect(() => gunzip(gzip(Uint8Array.from([7])), 1024)).toThrow(
      "invalid DEFLATE block type",
    );
    expect(() => gunzip(gzip(fixedStream([286])), 1024)).toThrow(
      "invalid DEFLATE length",
    );
    expect(() =>
      gunzip(gzip(fixedStream([257], 30)), 1024),
    ).toThrow("invalid DEFLATE distance");
    expect(() =>
      gunzip(gzip(fixedStream([257], 1)), 1024),
    ).toThrow("invalid DEFLATE distance");
  });

  it("rejects malformed dynamic Huffman trees", () => {
    const emptyTree = new BitWriter();
    emptyTree.write(1, 1);
    emptyTree.write(2, 2);
    emptyTree.write(0, 5);
    emptyTree.write(0, 5);
    emptyTree.write(0, 4);
    for (let index = 0; index < 4; index += 1) emptyTree.write(0, 3);
    expect(() => gunzip(gzip(emptyTree.finish()), 1024)).toThrow(
      "empty DEFLATE Huffman tree",
    );

    const repeatWithoutPrevious = new BitWriter();
    repeatWithoutPrevious.write(1, 1);
    repeatWithoutPrevious.write(2, 2);
    repeatWithoutPrevious.write(0, 5);
    repeatWithoutPrevious.write(0, 5);
    repeatWithoutPrevious.write(0, 4);
    repeatWithoutPrevious.write(1, 3);
    repeatWithoutPrevious.write(0, 3);
    repeatWithoutPrevious.write(0, 3);
    repeatWithoutPrevious.write(0, 3);
    repeatWithoutPrevious.write(0, 1);
    expect(() =>
      gunzip(gzip(repeatWithoutPrevious.finish()), 1024),
    ).toThrow("invalid DEFLATE repeat code");

    const invalidCode = new BitWriter();
    invalidCode.write(1, 1);
    invalidCode.write(2, 2);
    invalidCode.write(0, 5);
    invalidCode.write(0, 5);
    invalidCode.write(0, 4);
    invalidCode.write(1, 3);
    invalidCode.write(0, 3);
    invalidCode.write(0, 3);
    invalidCode.write(0, 3);
    invalidCode.write(1, 1);
    expect(() => gunzip(gzip(invalidCode.finish()), 1024)).toThrow(
      "invalid DEFLATE Huffman code",
    );

    const validRepeat = new BitWriter();
    validRepeat.write(1, 1);
    validRepeat.write(2, 2);
    validRepeat.write(0, 5);
    validRepeat.write(0, 5);
    validRepeat.write(0, 4);
    validRepeat.write(1, 3);
    validRepeat.write(0, 3);
    validRepeat.write(0, 3);
    validRepeat.write(1, 3);
    validRepeat.write(0, 1);
    validRepeat.write(1, 1);
    validRepeat.write(0, 2);
    for (let index = 0; index < 254; index += 1) {
      validRepeat.write(0, 1);
    }
    expect(() => gunzip(gzip(validRepeat.finish()), 1024)).toThrow(
      "empty DEFLATE Huffman tree",
    );

    const overflow = new BitWriter();
    overflow.write(1, 1);
    overflow.write(2, 2);
    overflow.write(0, 5);
    overflow.write(0, 5);
    overflow.write(0, 4);
    overflow.write(0, 3);
    overflow.write(0, 3);
    overflow.write(1, 3);
    overflow.write(0, 3);
    for (let index = 0; index < 2; index += 1) {
      overflow.write(0, 1);
      overflow.write(127, 7);
    }
    expect(() => gunzip(gzip(overflow.finish()), 1024)).toThrow(
      "invalid DEFLATE code lengths",
    );
  });

  it("rejects a mismatched uncompressed size", () => {
    const source = gzipSync(new TextEncoder().encode("size"));
    source[source.length - 4] = 99;

    expect(() => gunzip(source, 1024)).toThrow("gzip size mismatch");
  });
});
