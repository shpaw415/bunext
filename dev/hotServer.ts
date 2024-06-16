export function sendSignal() {
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}
