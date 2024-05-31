import type { ServerWebSocket, Subprocess } from "bun";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var HotServer: Subprocess<"ignore", "inherit", "inherit">;
}

globalThis.socketList ??= [];

export function serveHotServer(port: number) {
  const clearSocket = () => {
    globalThis.socketList = globalThis.socketList.filter(
      (s) => s.readyState == 0 || s.readyState == 1
    );
  };

  Bun.serve({
    websocket: {
      message: (ws, message) => {},
      open(ws) {
        ws.send("welcome");
        socketList.push(ws);
        clearSocket();
      },
      close(ws) {
        globalThis.socketList.splice(
          socketList.findIndex((s) => s == ws),
          1
        );
        clearSocket();
      },
    },
    fetch(req, server) {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("Error", { status: 400 });
      }
      return new Response("OK");
    },
    port: port,
  });

  setInterval(() => {
    clearSocket();
  }, 10000);
}

export function sendSignal() {
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}
