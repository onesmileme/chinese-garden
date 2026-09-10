export interface RuntimeContentConfig {
  apiBaseUrl: string;
  platform: "WECHAT" | "DOUYIN";
  platformAppId: string;
  clientVersion: string;
  loginCode: string;
}

export function resolveBrowserRuntimeContentConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
  production = import.meta.env.PROD,
): RuntimeContentConfig {
  const platform = env.VITE_PLATFORM === "DOUYIN" ? "DOUYIN" : "WECHAT";
  const config: RuntimeContentConfig = {
    apiBaseUrl:
      typeof env.VITE_API_BASE_URL === "string"
        ? env.VITE_API_BASE_URL.trim()
        : "",
    platform,
    platformAppId:
      typeof env.VITE_PLATFORM_APP_ID === "string"
        ? env.VITE_PLATFORM_APP_ID.trim()
        : "",
    clientVersion:
      typeof env.VITE_CLIENT_VERSION === "string" &&
      env.VITE_CLIENT_VERSION.trim() !== ""
        ? env.VITE_CLIENT_VERSION.trim()
        : "0.0.0",
    loginCode:
      typeof env.VITE_PLATFORM_LOGIN_CODE === "string"
        ? env.VITE_PLATFORM_LOGIN_CODE.trim()
        : "",
  };
  if (
    production &&
    (config.apiBaseUrl === "" ||
      config.platformAppId === "" ||
      config.clientVersion === "0.0.0")
  ) {
    throw new Error("runtime content configuration is incomplete");
  }
  return config;
}
