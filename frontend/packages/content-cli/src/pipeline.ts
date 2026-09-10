import { runGoldenChecks } from "./golden";
import { loadBundle } from "./load";
import { bundleFromSnapshot } from "./catalog-snapshot";
import { sliceBundleAtLevel } from "./levels";
import type {
  ContentLevel,
  LeveledPublishOutcome,
  PublishOptions,
  PublishOutcome,
  ReleaseArtifactRegistration,
  RuntimePackBundle,
  ValidationIssue,
} from "./model";
import { buildReleaseManifest, packBundle, packRuntimeBundle } from "./pack";
import type {
  BackendAdminPort,
  FileSystemPort,
  LeveledBackendAdminPort,
  Logger,
  ObjectStoragePort,
  Runner,
} from "./ports";
import { validateBundle } from "./validate";

export interface PublishDeps {
  fs: FileSystemPort;
  storage: ObjectStoragePort;
  admin: BackendAdminPort;
  runner: Runner;
  logger: Logger;
  contentRoot: string;
  repoRoot: string;
}

export interface LeveledPublishDeps extends Omit<PublishDeps, "admin"> {
  admin: LeveledBackendAdminPort;
}

function failedOutcome(
  options: PublishOptions,
  issues: ValidationIssue[],
): PublishOutcome {
  return {
    ok: false,
    version: options.version,
    sha256: "",
    manifestUrl: null,
    finalStatus: null,
    issues,
  };
}

export async function publish(
  deps: PublishDeps,
  options: PublishOptions,
): Promise<PublishOutcome> {
  const bundle = await loadBundle(
    deps.fs,
    deps.contentRoot,
    options.ruleVersion,
    options.contentLevelRuleVersion,
  );
  const issues = validateBundle(bundle, options);
  if (issues.length === 0) {
    issues.push(...(await runGoldenChecks(deps.runner, deps.repoRoot)));
  }
  if (issues.length > 0) {
    deps.logger.error(`release validation failed: ${issues.length} issue(s)`);
    return failedOutcome(options, issues);
  }

  if (options.approvedBy.trim() === "") {
    return failedOutcome(options, [
      {
        stage: "VERSION",
        path: "approval",
        code: "NOT_APPROVED",
        message: "--approved-by is required",
      },
    ]);
  }

  const pack = await packBundle(bundle, options);
  if (options.dryRun) {
    deps.logger.info(`dry run complete: ${pack.sha256}`);
    return {
      ok: true,
      version: options.version,
      sha256: pack.sha256,
      manifestUrl: null,
      finalStatus: null,
      issues: [],
    };
  }

  const payloadKey = `releases/${options.version}/content-${pack.sha256}.tar.gz`;
  const manifestUrl = await deps.storage.upload(
    payloadKey,
    pack.bytes,
    "application/gzip",
  );
  const sidecar = buildReleaseManifest(pack, options, bundle);
  const sidecarKey = `releases/${options.version}/manifest-${pack.sha256}.json`;
  await deps.storage.upload(
    sidecarKey,
    new TextEncoder().encode(`${JSON.stringify(sidecar)}\n`),
    "application/json",
  );

  await deps.admin.register(
    {
      version: options.version,
      ruleVersion: options.ruleVersion,
      manifestUrl,
      sha256: pack.sha256,
      fileSize: pack.fileSize,
      minClientVersion: options.minClientVersion,
    },
    options.approvedBy,
  );
  await deps.admin.transition(
    options.version,
    "VALIDATED",
    options.approvedBy,
  );
  await deps.admin.transition(
    options.version,
    "PUBLISHED",
    options.approvedBy,
  );

  return {
    ok: true,
    version: options.version,
    sha256: pack.sha256,
    manifestUrl,
    finalStatus: "PUBLISHED",
    issues: [],
  };
}

export async function publishLeveled(
  deps: LeveledPublishDeps,
  options: PublishOptions,
): Promise<LeveledPublishOutcome> {
  if (options.approvedBy.trim() === "") {
    return {
      ok: false,
      version: options.version,
      artifacts: [],
      finalStatus: null,
      issues: [
        {
          stage: "VERSION",
          path: "approval",
          code: "NOT_APPROVED",
          message: "--approved-by is required",
        },
      ],
    };
  }
  const snapshot = await deps.admin.createSnapshot(
    {
      version: options.version,
      masteryRuleVersion: options.ruleVersion,
      progressionRuleVersion: "progression-v1",
      contentLevelRuleVersion: options.contentLevelRuleVersion,
      minClientVersion: options.minClientVersion,
    },
    options.approvedBy,
  );
  const staticBundle = await loadBundle(
    deps.fs,
    deps.contentRoot,
    options.ruleVersion,
    options.contentLevelRuleVersion,
  );
  const curriculumMap = JSON.parse(
    new TextDecoder().decode(
      await deps.fs.readFile(
        `${deps.contentRoot}/curriculum/curriculum-v1.json`,
      ),
    ),
  ) as unknown;
  const source = bundleFromSnapshot(snapshot, {
    ...staticBundle,
    curriculumMap,
  } satisfies RuntimePackBundle);
  const issues = validateBundle(source, options);
  if (issues.length === 0) {
    issues.push(...(await runGoldenChecks(deps.runner, deps.repoRoot)));
  }
  if (issues.length > 0) {
    return {
      ok: false,
      version: options.version,
      artifacts: [],
      finalStatus: null,
      issues,
    };
  }
  const artifacts: ReleaseArtifactRegistration[] = [];
  for (const level of [1, 2, 3, 4, 5] as const satisfies readonly ContentLevel[]) {
    const pack = await packRuntimeBundle(sliceBundleAtLevel(source, level));
    if (!options.dryRun) {
      const key =
        `releases/${options.version}/L${level}/content-${pack.sha256}.tar.gz`;
      const artifactUrl = await deps.storage.upload(
        key,
        pack.bytes,
        "application/gzip",
      );
      artifacts.push({
        level,
        artifactUrl,
        sha256: pack.sha256,
        fileSize: pack.fileSize,
        format: "tar+gzip" as const,
      });
    }
  }
  if (options.dryRun) {
    return {
      ok: true,
      version: options.version,
      artifacts: [],
      finalStatus: null,
      issues: [],
    };
  }
  await deps.admin.registerArtifacts(
    options.version,
    artifacts,
    options.approvedBy,
  );
  await deps.admin.transition(options.version, "VALIDATED", options.approvedBy);
  await deps.admin.transition(options.version, "PUBLISHED", options.approvedBy);
  return {
    ok: true,
    version: options.version,
    artifacts,
    finalStatus: "PUBLISHED",
    issues: [],
  };
}
