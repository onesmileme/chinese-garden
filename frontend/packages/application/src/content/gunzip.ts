const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43,
  51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
] as const;
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4,
  4, 4, 5, 5, 5, 5, 0,
] as const;
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385,
  513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385,
  24577,
] as const;
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9,
  10, 10, 11, 11, 12, 12, 13, 13,
] as const;
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
] as const;

class BitReader {
  private bitOffset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(count: number): number {
    if (this.bitOffset + count > this.bytes.length * 8) {
      throw new Error("unexpected end of DEFLATE stream");
    }
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = this.bitOffset + index;
      value |=
        ((this.bytes[offset >>> 3]! >>> (offset & 7)) & 1) << index;
    }
    this.bitOffset += count;
    return value;
  }

  align(): void {
    this.bitOffset = Math.ceil(this.bitOffset / 8) * 8;
  }

  readAlignedBytes(length: number): Uint8Array {
    this.align();
    const offset = this.bitOffset >>> 3;
    const end = offset + length;
    if (end > this.bytes.length) {
      throw new Error("unexpected end of DEFLATE stream");
    }
    this.bitOffset = end * 8;
    return this.bytes.subarray(offset, end);
  }
}

class OutputBuffer {
  private bytes = new Uint8Array(32 * 1024);
  private length = 0;

  constructor(private readonly limit: number) {}

  push(value: number): void {
    this.ensure(1);
    this.bytes[this.length] = value;
    this.length += 1;
  }

  append(values: Uint8Array): void {
    this.ensure(values.length);
    this.bytes.set(values, this.length);
    this.length += values.length;
  }

  copy(distance: number, length: number): void {
    if (distance <= 0 || distance > this.length) {
      throw new Error("invalid DEFLATE distance");
    }
    this.ensure(length);
    for (let index = 0; index < length; index += 1) {
      this.bytes[this.length] = this.bytes[this.length - distance]!;
      this.length += 1;
    }
  }

  finish(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }

  private ensure(additional: number): void {
    const required = this.length + additional;
    if (required > this.limit) {
      throw new Error("decompressed artifact exceeds size limit");
    }
    if (required <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < required) capacity *= 2;
    const grown = new Uint8Array(Math.min(capacity, this.limit));
    grown.set(this.bytes);
    this.bytes = grown;
  }
}

interface Huffman {
  maxBits: number;
  symbols: ReadonlyMap<number, number>;
}

function reverseBits(value: number, length: number): number {
  let reversed = 0;
  for (let index = 0; index < length; index += 1) {
    reversed = (reversed << 1) | ((value >>> index) & 1);
  }
  return reversed;
}

function huffman(lengths: readonly number[]): Huffman {
  const maxBits = Math.max(...lengths);
  if (maxBits === 0) throw new Error("empty DEFLATE Huffman tree");
  const counts = new Array<number>(maxBits + 1).fill(0);
  for (const length of lengths) {
    if (length > 0) counts[length] = counts[length]! + 1;
  }
  const next = new Array<number>(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + counts[bits - 1]!) << 1;
    next[bits] = code;
  }
  const symbols = new Map<number, number>();
  lengths.forEach((length, symbol) => {
    if (length === 0) return;
    const canonical = next[length]!;
    next[length] = canonical + 1;
    symbols.set((1 << length) | reverseBits(canonical, length), symbol);
  });
  return { maxBits, symbols };
}

function decodeSymbol(reader: BitReader, tree: Huffman): number {
  let code = 0;
  for (let length = 1; length <= tree.maxBits; length += 1) {
    code |= reader.read(1) << (length - 1);
    const symbol = tree.symbols.get((1 << length) | code);
    if (symbol !== undefined) return symbol;
  }
  throw new Error("invalid DEFLATE Huffman code");
}

const FIXED_LITERAL_LENGTHS = Array.from({ length: 288 }, (_, symbol) =>
  symbol <= 143 ? 8 : symbol <= 255 ? 9 : symbol <= 279 ? 7 : 8,
);
const FIXED_DISTANCE_LENGTHS = Array.from({ length: 32 }, () => 5);
const FIXED_LITERAL_TREE = huffman(FIXED_LITERAL_LENGTHS);
const FIXED_DISTANCE_TREE = huffman(FIXED_DISTANCE_LENGTHS);

function dynamicTrees(reader: BitReader): [Huffman, Huffman] {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeLengthCount = reader.read(4) + 4;
  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeLengthCount; index += 1) {
    codeLengths[CODE_LENGTH_ORDER[index]!] = reader.read(3);
  }
  const codeLengthTree = huffman(codeLengths);
  const lengths: number[] = [];
  while (lengths.length < literalCount + distanceCount) {
    const symbol = decodeSymbol(reader, codeLengthTree);
    if (symbol <= 15) {
      lengths.push(symbol);
      continue;
    }
    if (symbol === 16) {
      const previous = lengths[lengths.length - 1];
      if (previous === undefined) {
        throw new Error("invalid DEFLATE repeat code");
      }
      const count = reader.read(2) + 3;
      lengths.push(...Array.from({ length: count }, () => previous));
      continue;
    }
    const count =
      symbol === 17 ? reader.read(3) + 3 : reader.read(7) + 11;
    lengths.push(...Array.from({ length: count }, () => 0));
  }
  if (lengths.length !== literalCount + distanceCount) {
    throw new Error("invalid DEFLATE code lengths");
  }
  return [
    huffman(lengths.slice(0, literalCount)),
    huffman(lengths.slice(literalCount)),
  ];
}

function inflateRaw(
  bytes: Uint8Array,
  maximumOutputBytes: number,
): Uint8Array {
  const reader = new BitReader(bytes);
  const output = new OutputBuffer(maximumOutputBytes);
  let final = false;
  while (!final) {
    final = reader.read(1) === 1;
    const type = reader.read(2);
    if (type === 0) {
      reader.align();
      const lengthBytes = reader.readAlignedBytes(4);
      const length = lengthBytes[0]! | (lengthBytes[1]! << 8);
      const complement = lengthBytes[2]! | (lengthBytes[3]! << 8);
      if ((length ^ 0xffff) !== complement) {
        throw new Error("invalid stored DEFLATE block");
      }
      output.append(reader.readAlignedBytes(length));
      continue;
    }
    if (type === 3) throw new Error("invalid DEFLATE block type");
    const [literalTree, distanceTree] =
      type === 1
        ? [FIXED_LITERAL_TREE, FIXED_DISTANCE_TREE]
        : dynamicTrees(reader);
    while (true) {
      const symbol = decodeSymbol(reader, literalTree);
      if (symbol < 256) {
        output.push(symbol);
        continue;
      }
      if (symbol === 256) break;
      const lengthIndex = symbol - 257;
      const baseLength = LENGTH_BASE[lengthIndex];
      const extraLengthBits = LENGTH_EXTRA[lengthIndex];
      if (baseLength === undefined || extraLengthBits === undefined) {
        throw new Error("invalid DEFLATE length");
      }
      const length = baseLength + reader.read(extraLengthBits);
      const distanceSymbol = decodeSymbol(reader, distanceTree);
      const baseDistance = DISTANCE_BASE[distanceSymbol];
      const extraDistanceBits = DISTANCE_EXTRA[distanceSymbol];
      if (baseDistance === undefined || extraDistanceBits === undefined) {
        throw new Error("invalid DEFLATE distance");
      }
      output.copy(
        baseDistance + reader.read(extraDistanceBits),
        length,
      );
    }
  }
  return output.finish();
}

function skipZeroTerminated(bytes: Uint8Array, offset: number): number {
  while (offset < bytes.length && bytes[offset] !== 0) offset += 1;
  if (offset >= bytes.length) throw new Error("invalid gzip header");
  return offset + 1;
}

export function gunzip(
  bytes: Uint8Array,
  maximumOutputBytes: number,
): Uint8Array {
  if (
    bytes.length < 18 ||
    bytes[0] !== 0x1f ||
    bytes[1] !== 0x8b ||
    bytes[2] !== 8
  ) {
    throw new Error("invalid gzip header");
  }
  const flags = bytes[3]!;
  if ((flags & 0xe0) !== 0) throw new Error("invalid gzip flags");
  let offset = 10;
  if ((flags & 4) !== 0) {
    if (offset + 2 > bytes.length - 8) throw new Error("invalid gzip header");
    const extraLength = bytes[offset]! | (bytes[offset + 1]! << 8);
    offset += 2 + extraLength;
  }
  if ((flags & 8) !== 0) offset = skipZeroTerminated(bytes, offset);
  if ((flags & 16) !== 0) offset = skipZeroTerminated(bytes, offset);
  if ((flags & 2) !== 0) offset += 2;
  if (offset > bytes.length - 8) throw new Error("invalid gzip header");
  const output = inflateRaw(bytes.subarray(offset, bytes.length - 8), maximumOutputBytes);
  const trailer = new DataView(
    bytes.buffer,
    bytes.byteOffset + bytes.length - 8,
    8,
  );
  if (trailer.getUint32(4, true) !== output.length) {
    throw new Error("gzip size mismatch");
  }
  return output;
}
