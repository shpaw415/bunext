export async function InitGlobalServerConfig() {
  const config = (await import(`${process.cwd()}/config/server.ts`)).default;
  globalThis.serverConfig ??= config;
}
