const ADMIN_TOKEN_KEY = "cc_admin_token";

export interface AdminSessionStore {
  read(): string | null;
  write(token: string): void;
  clear(): void;
}

export function createAdminSessionStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): AdminSessionStore {
  return {
    read: () => storage.getItem(ADMIN_TOKEN_KEY),
    write: (token) => storage.setItem(ADMIN_TOKEN_KEY, token),
    clear: () => storage.removeItem(ADMIN_TOKEN_KEY),
  };
}
