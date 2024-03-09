import type { ServerWebSocket, Subprocess } from "bun";
import { paths } from "../globals";

declare global {
  var socketList: ServerWebSocket<unknown>[];
  var HotServer: Subprocess<"ignore", "pipe", "inherit">;
}

globalThis.socketList ??= [];

if (import.meta.main) {
  process.on("message", (message) => {
    console.log("the message:", message);
    if (message == "signal") {
      _sendSignal();
    }
  });
  serveHotServer();
}

export function serveHotServer() {
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
    port: 3001,
  });

  setInterval(() => {
    clearSocket();
  }, 10000);
}

function _sendSignal() {
  console.log("socket connected: ", globalThis.socketList.length);
  for (const ws of globalThis.socketList) {
    ws.send("reload");
  }
}

export function sendSignal() {
  globalThis.HotServer.send("signal");
}

export function _serveHotServer() {
  const proc = Bun.spawn({
    cmd: ["bun", `${paths.bunextModulePath}/bin/hotServer.ts`],
  });
  globalThis.HotServer = proc;
}
