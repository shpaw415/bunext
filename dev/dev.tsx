import { useContext } from "react";
import { ReloadContext } from "../bun-react-ssr/router";

declare global {
  var __BUNEXT_DEV_INIT: boolean;
  var webSocket: undefined | WebSocket;
}

globalThis.__BUNEXT_DEV_INIT ??= true;

export function setDevEnvironement() {
  globalThis.mode = "dev";
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
  globalThis.webSocket = ws;
  return <></>;
}
