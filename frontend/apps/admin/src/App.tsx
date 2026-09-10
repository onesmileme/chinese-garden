import { createAdminOperationsClient } from "@cc/api-client";
import { tokens } from "@cc/ui/tokens";
import { type CSSProperties, useMemo } from "react";
import {
  AdminSessionGate,
  type AdminPortFactory,
} from "./components/AdminSessionGate";
import { AppShell } from "./components/AppShell";
import { canAccessRoute } from "./authorization";
import { ContentImportPage } from "./pages/ContentImportPage";
import { ContentLibraryPage } from "./pages/ContentLibraryPage";
import { LevelCoveragePage } from "./pages/LevelCoveragePage";
import { ReleaseCenterPage } from "./pages/ReleaseCenterPage";
import { type AdminRoute, useRoute } from "./router";
import { createAdminSessionStore } from "./session";
import "./styles.css";

export type { AdminPortFactory } from "./components/AdminSessionGate";

const defaultPortFactory: AdminPortFactory = (token, onUnauthorized) =>
  createAdminOperationsClient("", () => token, { onUnauthorized });

const theme = {
  "--admin-text": tokens.color.text,
  "--admin-text-soft": tokens.color.textSoft,
  "--admin-surface": tokens.color.surface,
  "--admin-border": tokens.color.locked,
  "--admin-success": tokens.color.done,
  "--admin-danger": tokens.color.wrong,
  "--admin-radius-sm": `${tokens.radius.sm}px`,
  "--admin-radius-md": `${tokens.radius.md}px`,
  "--admin-space-1": `${tokens.space[1]}px`,
  "--admin-space-2": `${tokens.space[2]}px`,
  "--admin-space-3": `${tokens.space[3]}px`,
  "--admin-space-4": `${tokens.space[4]}px`,
  "--admin-space-5": `${tokens.space[5]}px`,
  "--admin-space-6": `${tokens.space[6]}px`,
} as CSSProperties;

export interface AppProps {
  createPort?: AdminPortFactory;
  initialRoute?: AdminRoute;
}

export function App({
  createPort = defaultPortFactory,
  initialRoute,
}: AppProps) {
  const hashRoute = useRoute();
  const route = initialRoute ?? hashRoute;
  const store = useMemo(
    () => createAdminSessionStore(globalThis.sessionStorage),
    [],
  );

  return (
    <div className="admin-app" style={theme}>
      <AdminSessionGate createPort={createPort} store={store}>
        {({ port, session, logout }) => (
          <AppShell route={route} session={session} onLogout={logout}>
            {!canAccessRoute(session.roles, route) ? (
              <section
                aria-labelledby="forbidden-title"
                className="forbidden-page"
              >
                <p className="page-kicker">访问控制</p>
                <h1 id="forbidden-title">权限不足</h1>
                <p>当前角色无权访问此模块。</p>
              </section>
            ) : route === "/content" ? (
              <ContentLibraryPage port={port} roles={session.roles} />
            ) : route === "/levels" ? (
              <LevelCoveragePage port={port} />
            ) : route === "/imports" ? (
              <ContentImportPage port={port} />
            ) : (
              <ReleaseCenterPage port={port} roles={session.roles} />
            )}
          </AppShell>
        )}
      </AdminSessionGate>
    </div>
  );
}
