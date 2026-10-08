import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

type TextProducer = () => string | Promise<string>;

export interface AtomicFileHandle {
  writeFile(content: string): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileOperations {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: "wx"): Promise<AtomicFileHandle>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
}

const nodeAtomicFileOperations: AtomicFileOperations = {
  mkdir,
  open,
  rename,
  rm,
};

export async function writeTextAtomic(
  path: string,
  content: string | TextProducer,
  operations: AtomicFileOperations = nodeAtomicFileOperations,
): Promise<void> {
  await operations.mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let lock: AtomicFileHandle | undefined;
  let temporary: AtomicFileHandle | undefined;
  let temporaryCreated = false;
  let operationError: unknown;
  let cleanupError: unknown;
  const cleanup = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      if (cleanupError === undefined) cleanupError = error;
    }
  };

  try {
    lock = await operations.open(lockPath, "wx");
    temporary = await operations.open(temporaryPath, "wx");
    temporaryCreated = true;
    const text = typeof content === "string" ? content : await content();
    await temporary.writeFile(text);
    await temporary.close();
    temporary = undefined;
    await operations.rename(temporaryPath, path);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      if (temporary !== undefined) {
        await cleanup(() => temporary!.close());
      }
      if (temporaryCreated) {
        await cleanup(() => operations.rm(temporaryPath, { force: true }));
      }
    } finally {
      if (lock !== undefined) {
        try {
          await cleanup(() => lock!.close());
        } finally {
          await cleanup(() => operations.rm(lockPath, { force: true }));
        }
      }
    }
    if (operationError === undefined && cleanupError !== undefined) {
      throw cleanupError;
    }
  }
}
