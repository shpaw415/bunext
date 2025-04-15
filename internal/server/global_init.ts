import type { ServerConfig } from "../types";

export async function InitGlobalServerConfig() {
  if (globalThis?.serverConfig) return;
  const config: ServerConfig = (
    await import(
      process.env?.__BUNEXT_DEV__
        ? `${process.cwd()}/config.dev/server.ts`
        : `${process.cwd()}/config/server.ts`
    )
  ).default as ServerConfig;

  globalThis.serverConfig ??= config;
}
