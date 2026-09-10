import {
  leveledManifestSchema,
  type LeveledManifest,
} from "@cc/content-schema";
import type { HttpClient } from "./http";

export interface ContentClient {
  manifest(childProfileId: string): Promise<LeveledManifest>;
}

export function createContentClient(http: HttpClient): ContentClient {
  return {
    async manifest(childProfileId) {
      if (childProfileId.trim() === "") {
        throw new Error("childProfileId must not be blank");
      }
      return leveledManifestSchema.parse(
        await http.get("/v1/content/manifest", {
          "X-Child-Profile-Id": childProfileId,
        }),
      );
    },
  };
}
