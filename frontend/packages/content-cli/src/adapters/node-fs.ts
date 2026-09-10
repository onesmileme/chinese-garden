import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileSystemPort } from "../ports";

export const nodeFileSystem: FileSystemPort = {
  readFile,
  async readJsonDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
    return Promise.all(
      names.map(async (name) => ({
        name,
        json: JSON.parse(await readFile(join(dir, name), "utf8")) as unknown,
      })),
    );
  },
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async writeFile(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
};
