import { test, expect, describe, afterAll } from "bun:test";

import "../internal/server_global.ts";
import { builder } from "../internal/build";
import { revalidate } from "../features/router.ts";
import { rmSync, mkdirSync } from "fs";
import { router } from "../internal/router.tsx";
import { Head } from "../features/head.tsx";
import { Server } from "../.bunext/react-ssr/server.ts";

describe("Build features", () => {
  test("Build", async () => {
    const buildOut = await builder.makeBuild();
    expect(buildOut?.ssrElement.length).toBeGreaterThan(0);
    expect(buildOut?.revalidates.length).toBeGreaterThan(0);
    router.setRoutes();
    const matched = router.client?.match("/");
    expect(matched).not.toBe(null);
  });

  test("revalidate", async () => {
    await revalidate("/");
  });

  test("Header data", () => {
    expect(Object.keys(Head.head).length).toBe(3);
  });
});

describe("Server Features", () => {
  test("start server", async () => {
    expect(Server.server).not.toBe(undefined);

    const res = await fetch(`http://localhost:${Server.port}/`);
    expect(res.ok).toBe(true);
  });

  test("start hotServer", async () => {
    Server.serveHotServer(3001);
    expect(Server.hotServer).not.toBe(undefined);
    const promiseRes = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${Server.hotServerPort}`);
      ws.addEventListener("message", (ev) => {
        if (ev.data == "welcome") resolve(true);
      });
      setTimeout(() => {
        resolve(false);
      }, 10000);
    });
    expect(promiseRes).toBe(true);
  });

  test("Server Action", async () => {
    await router.InitServerActions();
    expect(
      Array.prototype.concat(...router.serverActions.map((e) => e.actions))
        .length
    ).toBe(2);
    const form = new FormData();
    form.append("props", encodeURI(JSON.stringify([])));
    const res = await fetch(
      `http://localhost:${Server.port}/ServerActionGetter`,
      {
        headers: {
          serveractionid: "/action.ts:ServerDoStuff",
        },
        body: form,
        method: "POST",
      }
    );
    expect(JSON.parse(await res.text()).props).toBe(true);
  });
});

test("API EndPoint", async () => {
  const methods = ["POST", "GET", "PUT", "DELETE"];
  for await (const method of methods) {
    expect(
      await (
        await fetch(`http://localhost:${Server.port}/api/v1`, {
          method,
        })
      ).text()
    ).toBe(method);
  }
});

afterAll(async () => {
  //cleanUpBuild();
  await cleanUpServers();
});

function cleanUpBuild() {
  rmSync(process.cwd() + "/.bunext/build", {
    force: true,
    recursive: true,
  });
  mkdirSync(process.cwd() + "/.bunext/build");
}

async function cleanUpServers() {
  const server = (await import("../.bunext/react-ssr/server.ts")).Server;
  server.server?.stop(true);
  server.hotServer?.stop(true);
}
