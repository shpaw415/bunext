import { useContext, useEffect, useState } from "react";
import { ReloadContext } from "../internal/router/index";

declare global {
  var __BUNEXT_DEV_INIT: boolean;
}
globalThis.__BUNEXT_DEV_INIT ??= true;

export function Dev() {
  const reload = useContext(ReloadContext);
  const [opened, setOpen] = useState(false);
  const [retry, setRetry] = useState(false);
  const [_ws, setWs] = useState<WebSocket>();
  useEffect(() => {
    if (globalThis.__NODE_ENV__ != "development" || opened) return;
    if (_ws) _ws.close();
    const p = window.location;
    const ws = new WebSocket(
      `${p.protocol.includes("https") ? "wss" : "ws"}://${p.hostname}:${3001}`
    );
    ws.addEventListener("message", (ev) => {
      if (ev.data != "reload") return;
      try {
        reload();
      } catch {
        window.location.reload();
      }
    });
    ws.addEventListener("open", () => setOpen(true));
    ws.addEventListener("close", () => setOpen(false));
    ws.addEventListener("error", () => setOpen(false));
    setWs(ws);
  }, [opened]);
  if (!opened && _ws && _ws.readyState == 0)
    setTimeout(() => setRetry(!retry), 5000);

  return <></>;
}
