import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function writeTextAtomic(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let lock: FileHandle | undefined;
  try {
    lock = await open(lockPath, "wx");
    await writeFile(temporaryPath, content, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
    if (lock !== undefined) {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
