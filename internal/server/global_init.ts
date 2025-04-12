export async function InitGlobalServerConfig() {
  if (globalThis?.serverConfig) return;
  const config = (await import(`${process.cwd()}/config/server.ts`)).default;
  globalThis.serverConfig ??= config;
}
