import { addScript } from "../componants/script";

export function setDevEnvironement() {
  globalThis.mode = "dev";
}

export function ClientsetHotServer() {
  addScript(() => {
    const p = window.location;
    const ws = new WebSocket(
      `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${3001}`
    );
    ws.addEventListener(
      "message",
      (ev) => ev.data == "reload" && window.location.reload()
    );
    ws.addEventListener("close", () => window.location.reload());
  });
}

export function sendSignal() {
  console.log("socket", globalThis.socketList.length);
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}
