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
