import type { AdminSession } from "@cc/api-client";
import {
  BarChart3,
  FileUp,
  LibraryBig,
  LogOut,
  PackageCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { canAccessRoute } from "../authorization";
import type { AdminRoute } from "../router";

const NAVIGATION = [
  { route: "/content", label: "内容库", icon: LibraryBig },
  { route: "/levels", label: "等级覆盖", icon: BarChart3 },
  { route: "/imports", label: "批量导入", icon: FileUp },
  { route: "/releases", label: "发布中心", icon: PackageCheck },
] as const;

interface AppShellProps {
  children: ReactNode;
  route: AdminRoute;
  session: AdminSession;
  onLogout: () => void;
}

export function AppShell({
  children,
  route,
  session,
  onLogout,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-kicker">CHILD CHINESE</span>
          <strong>运营管理</strong>
        </div>
        <nav aria-label="管理后台导航">
          {NAVIGATION.filter((item) =>
            canAccessRoute(session.roles, item.route),
          ).map((item) => {
            const Icon = item.icon;
            return (
              <a
                aria-current={route === item.route ? "page" : undefined}
                className="nav-link"
                href={`#${item.route}`}
                key={item.route}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="principal">
            <strong>{session.actor}</strong>
            <div aria-label="管理员角色" className="role-list">
              {session.roles.map((role) => (
                <span className="role-badge" key={role}>
                  {role}
                </span>
              ))}
            </div>
          </div>
          <button className="logout-button" onClick={onLogout} type="button">
            <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
            退出登录
          </button>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
