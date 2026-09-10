import { authSessionSchema } from "@cc/content-schema";
import type { AuthSession, HttpClient } from "./http";

export interface PlatformLoginRequest {
  platform: "WECHAT" | "DOUYIN";
  platformAppId: string;
  code: string;
}

export interface AuthClient {
  platformLogin(request: PlatformLoginRequest): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
}

export function createAuthClient(http: HttpClient): AuthClient {
  return {
    async platformLogin(request) {
      return authSessionSchema.parse(
        await http.post("/v1/auth/platform-login", request),
      );
    },
    async refresh(refreshToken) {
      return authSessionSchema.parse(
        await http.post("/v1/auth/refresh", { refreshToken }),
      );
    },
  };
}
