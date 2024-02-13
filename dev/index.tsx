import { addScriptToResponse } from "../src/server-response";
import { Script } from "../src/jsx-utils";

export async function sendSignal() {
  globalThis.wsList.forEach((ws) => {
    ws.send("reload");
  });
}

export async function createHotServer() {
  return Bun.serve({
    fetch(req, server) {
      if (server.upgrade(req)) return;
      return new Response("Upgrade failed :(", { status: 500 });
    },
    websocket: {
      message(ws, message) {},
      open(ws) {
        globalThis.wsList.push(ws);
      },
      close(ws) {
        const index = globalThis.wsList.indexOf(ws);
        globalThis.wsList = globalThis.wsList.slice(index, 1);
      },
    },
    port: 3001,
  });
}

export async function startHotServer() {
  try {
    globalThis.hotServer = await createHotServer();
  } catch {}
}

export function setDevEnvironement() {
  addScriptToResponse(
    <Script src={hotRealodClient} call key={"dev-reload-script"}></Script>
  );
}

function hotRealodClient(reload: boolean) {
  let socket;
  let error = false;
  const interval = setInterval(() => {
    try {
      socket = new WebSocket("ws://localhost:3001");
      socket.addEventListener("message", (event) => {
        if (event.data.toString("utf-8").trim() === "reload") {
          window.location.reload();
        }
      });
      socket.addEventListener("close", () => {
        hotRealodClient(true);
      });
      if (error || reload) window.location.reload();
      clearInterval(interval);
    } catch {
      error = true;
    }
  }, 1000);
}
