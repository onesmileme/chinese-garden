export interface RuntimeContentConfig {
  apiBaseUrl: string;
  platform: "WECHAT" | "DOUYIN";
  platformAppId: string;
  clientVersion: string;
}

export function resolveMiniappRuntimeContentConfig(
  env: Record<string, string | undefined> = process.env,
  taroEnv = process.env.TARO_ENV,
  production = process.env.NODE_ENV === "production",
): RuntimeContentConfig {
  const config: RuntimeContentConfig = {
    apiBaseUrl: env.TARO_APP_API_BASE_URL?.trim() ?? "",
    platform: taroEnv === "tt" ? "DOUYIN" : "WECHAT",
    platformAppId: env.TARO_APP_PLATFORM_APP_ID?.trim() ?? "",
    clientVersion: env.TARO_APP_CLIENT_VERSION?.trim() || "0.0.0",
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
