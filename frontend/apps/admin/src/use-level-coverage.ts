import type {
  AdminOperationsPort,
  ContentLevel,
  LevelCoverage,
} from "@cc/api-client";
import { useEffect, useState } from "react";

const LEVEL_ORDER: ContentLevel[] = ["L1", "L2", "L3", "L4", "L5"];

interface LevelCoverageState {
  status: "loading" | "ready" | "error";
  rows: LevelCoverage[];
  message: string | null;
}

function normalizeCoverage(rows: LevelCoverage[]): LevelCoverage[] {
  const rowsByLevel = new Map(rows.map((row) => [row.level, row]));
  return LEVEL_ORDER.map(
    (level) =>
      rowsByLevel.get(level) ?? {
        level,
        characters: 0,
        poems: 0,
        chainableIdioms: 0,
        blockingIssues: ["LEVEL_CONTENT_INSUFFICIENT"],
      },
  );
}

export function useLevelCoverage(port: AdminOperationsPort) {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<LevelCoverageState>({
    status: "loading",
    rows: [],
    message: null,
  });

  useEffect(() => {
    let active = true;

    setState({ status: "loading", rows: [], message: null });
    void port.coverage().then(
      (rows) => {
        if (active) {
          setState({
            status: "ready",
            rows: normalizeCoverage(rows),
            message: null,
          });
        }
      },
      () => {
        if (active) {
          setState({
            status: "error",
            rows: [],
            message: "无法加载等级覆盖，请重试",
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [port, retryKey]);

  return {
    state,
    commands: {
      retry: () => setRetryKey((current) => current + 1),
    },
  };
}
