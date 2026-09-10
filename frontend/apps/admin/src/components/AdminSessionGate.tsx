import type {
  AdminOperationsPort,
  AdminSession,
} from "@cc/api-client";
import { HttpError } from "@cc/api-client";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import type { AdminSessionStore } from "../session";

export type AdminPortFactory = (
  token: string,
  onUnauthorized: () => void,
) => AdminOperationsPort;

interface AuthenticatedState {
  status: "authenticated";
  port: AdminOperationsPort;
  session: AdminSession;
}

type GateState =
  | { status: "checking" }
  | { status: "signed-out"; message: string | null }
  | AuthenticatedState;

interface AdminSessionGateProps {
  createPort: AdminPortFactory;
  store: AdminSessionStore;
  children: (value: {
    port: AdminOperationsPort;
    session: AdminSession;
    logout: () => void;
  }) => ReactNode;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401;
}

export function AdminSessionGate({
  createPort,
  store,
  children,
}: AdminSessionGateProps) {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<GateState>(() =>
    store.read() === null
      ? { status: "signed-out", message: null }
      : { status: "checking" },
  );

  useEffect(() => {
    const restoredToken = store.read();
    if (restoredToken === null) return;

    let cancelled = false;
    const port = createPort(restoredToken, logout);
    void port.session().then(
      (session) => {
        if (!cancelled) {
          setState({ status: "authenticated", port, session });
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        store.clear();
        setState({
          status: "signed-out",
          message: isUnauthorized(error)
            ? "会话已失效，请重新登录"
            : "无法恢复管理员会话",
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [createPort, store]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = token.trim();
    const port = createPort(candidate, logout);
    setSubmitting(true);
    setState({ status: "signed-out", message: null });

    try {
      const session = await port.session();
      store.write(candidate);
      setToken("");
      setState({ status: "authenticated", port, session });
    } catch (error) {
      store.clear();
      setState({
        status: "signed-out",
        message: isUnauthorized(error)
          ? "管理员令牌无效"
          : "无法连接管理服务",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    store.clear();
    setToken("");
    setState({ status: "signed-out", message: null });
  }

  if (state.status === "checking") {
    return (
      <div className="admin-status" role="status">
        正在验证管理会话…
      </div>
    );
  }

  if (state.status === "authenticated") {
    return (
      <>
        {children({
          port: state.port,
          session: state.session,
          logout,
        })}
      </>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="product-mark">CHILD CHINESE · OPERATIONS</p>
        <h1 id="login-title">运营管理后台</h1>
        <p className="login-description">
          使用已授权的管理员令牌进入内容运营工作区。
        </p>
        <form onSubmit={submit}>
          <label htmlFor="admin-token">管理员令牌</label>
          <input
            autoComplete="current-password"
            id="admin-token"
            name="admin-token"
            onChange={(event) => setToken(event.currentTarget.value)}
            type="password"
            value={token}
          />
          {state.message === null ? null : (
            <p className="form-error" role="alert">
              {state.message}
            </p>
          )}
          <button
            disabled={submitting || token.trim() === ""}
            type="submit"
          >
            {submitting ? "正在验证…" : "进入管理后台"}
          </button>
        </form>
      </section>
    </main>
  );
}
