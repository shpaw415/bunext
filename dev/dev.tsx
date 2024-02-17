import { addScript } from "../componants/script";

export function setDevEnvironement() {
  globalThis.mode = "dev";
}

export function ClientsetHotServer() {
  addScript(() => {
    const p = window.location;
    const ws = new WebSocket(
      `${p.protocol === "http" ? "ws" : "wss"}://${p.hostname}:${3001}`
    );
    ws.addEventListener("message", (ev) => {
      console.log(ev.data);
    });
  });
}
