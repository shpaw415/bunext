import { useCallback, useContext, useEffect, useState } from "react";
import { ReloadContext } from "../internal/router/index";
import DevToolPanel from "./devtool/panel";

declare global {
  var __BUNEXT_DEV_INIT: boolean;
}
globalThis.__BUNEXT_DEV_INIT ??= true;

export function Dev({ children }: { children?: any }) {
  const reload = useContext(ReloadContext);
  const [_ws, setWs] = useState<WebSocket>();

  const resetWs = useCallback(
    (setter: React.Dispatch<React.SetStateAction<WebSocket | undefined>>) => {
      setter((ws) => {
        if (ws) ws.close();
        return undefined;
      });
    },
    []
  );

  const MakeWebSocket = useCallback(() => {
    const p = window.location;
    try {
      const ws = new WebSocket(
        `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${
          globalThis.serverConfig.Dev.hotServerPort
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
      ws.addEventListener("close", () => resetWs(setWs));
      ws.addEventListener("error", () => resetWs(setWs));

      return ws;
    } catch {}
  }, []);

  const wsSetInterval = useCallback(
    (setter: React.Dispatch<React.SetStateAction<WebSocket | undefined>>) => {
      setInterval(() => {
        setter((ws) => {
          if (ws) return ws;
          return MakeWebSocket();
        });
      }, 5000);
    },
    []
  );

  useEffect(() => {
    if (process.env.NODE_ENV != "development") return;
    setWs(MakeWebSocket());
    wsSetInterval(setWs);
  }, []);

  return (
    <>
      {children}
      {globalThis.serverConfig.Dev.devtoolPanel && <DevToolPanel />}
    </>
  );
}
