import { useContext } from "react";
import { ReloadContext } from "../bun-react-ssr/router";

declare global {
  var __BUNEXT_DEV_INIT: boolean;
}

globalThis.__BUNEXT_DEV_INIT ??= true;

export function setDevEnvironement() {
  globalThis.mode = "dev";
}

export function ClientsetHotServer() {
  /*addScript(() => {
    const p = window.location;
    const ws = new WebSocket(
      `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${3001}`
    );
    ws.addEventListener(
      "message",
      (ev) => ev.data == "reload" && window.location.reload()
    );
    ws.addEventListener("close", () => window.location.reload());
  });*/
}

export function sendSignal() {
  console.log("socket connected: ", globalThis.socketList.length);
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}

export function Dev() {
  if (typeof window === "undefined" || !globalThis.__BUNEXT_DEV_INIT)
    return <></>;
  else globalThis.__BUNEXT_DEV_INIT = false;
  const reload = useContext(ReloadContext);
  const p = window.location;
  const ws = new WebSocket(
    `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${3001}`
  );
  ws.addEventListener("message", (ev) => ev.data == "reload" && reload());
  ws.addEventListener("close", () => window.location.reload());

  return <></>;
}
