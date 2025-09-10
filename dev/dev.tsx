import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ReloadContext } from "../internal/router/index";
import DevToolPanel from "./devtool/panel";

declare global {
  var __BUNEXT_DEV_INIT: boolean;
}
globalThis.__BUNEXT_DEV_INIT ??= true;

export const DevWebSocketContext = createContext<WebSocket | undefined>(undefined);

export function Dev({ children }: { children?: any }) {
  const reload = useContext(ReloadContext);
  const ws = useRef<WebSocket | undefined>(undefined);
  const ws_interval = useRef<Timer | undefined>(undefined);

  const resetWs = useCallback(
    () => {
      if (ws.current) {
        try {
          ws.current.close();
        } catch { }
        ws.current = undefined;
      }
    },
    [ws.current]
  );

  const MakeWebSocket = useCallback(() => {

    const p = window.location;
    try {
      const ws = new WebSocket(
        `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${globalThis.serverConfig.Dev.hotServerPort
        }`
      );
      ws.addEventListener("message", (ev) => {
        if (ev.data != "reload") return;
        try {
          reload();
        } catch {
          window.location.reload();
        }
      });
      ws.addEventListener("close", () => resetWs());
      ws.addEventListener("error", () => resetWs());

      return ws;
    } catch { }
  }, [ws.current]);

  const wsSetInterval = useCallback(
    () => {
      return setInterval(() => {
        ws.current ??= MakeWebSocket();
      }, 5000);
    },
    [ws.current]
  );

  useEffect(() => {
    if (process.env.NODE_ENV != "development") return;
    if (!ws.current) ws.current = MakeWebSocket();
    if (!ws_interval.current) ws_interval.current = wsSetInterval();

    return () => {
      if (ws_interval.current) clearInterval(ws_interval.current);
      ws_interval.current = undefined;
      if (ws.current) {
        try {
          ws.current.close();
        } catch { }
        ws.current = undefined;
      }
    }
  }, []);

  return (
    <DevWebSocketContext.Provider value={ws.current}>
      {children}
      {globalThis.serverConfig?.Dev?.devtoolPanel &&
        process.env.NODE_ENV == "development" && <DevToolPanel />}
    </DevWebSocketContext.Provider>
  );
}
