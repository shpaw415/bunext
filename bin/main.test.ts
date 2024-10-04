import { test, expect, describe, afterAll } from "bun:test";

import "@bunpmjs/bunext/internal/server_global.ts";
import { builder } from "@bunpmjs/bunext/internal/build";
import { revalidate } from "@bunpmjs/bunext/features/router.ts";
import { router } from "@bunpmjs/bunext/internal/router";
import { Head } from "@bunpmjs/bunext/features/head";
import "../.bunext/react-ssr/server.ts";

const Server = globalThis.Server;

describe("Build features", () => {
  test.skip("Build", async () => {
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
    expect(Server).not.toBe(undefined);
    Server?.RunServer();
    expect(Server?.server).not.toBe(undefined);

    const res = await fetch(`http://localhost:${Server?.port}/`);
    expect(res.ok).toBe(true);
  });

  test("start hotServer", async () => {
    Server?.serveHotServer(3001);
    expect(Server?.hotServer).not.toBe(undefined);
    const promiseRes = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${Server?.hotServerPort}`);
      ws.addEventListener("message", (ev) => {
        if (ev.data == "welcome") resolve(true);
      });
      setTimeout(() => {
        resolve(false);
      }, 10000);
    });
    expect(promiseRes).toBe(true);
  });
});

test("Server Action", async () => {
  await router.InitServerActions();
  expect(
    Array.prototype.concat(...router.serverActions.map((e) => e.actions)).length
  ).toBeGreaterThan(1);

  const form = new FormData();
  form.append("props", encodeURI(JSON.stringify([])));
  const res = await fetch(
    `http://localhost:${Server?.port}/ServerActionGetter`,
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

test("API EndPoint", async () => {
  const make = async () => {
    const methods = ["POST", "GET", "PUT", "DELETE"];
    for await (const method of methods) {
      expect(
        await (
          await fetch(`http://localhost:${Server?.port}/api/v1`, {
            method,
          })
        ).text()
      ).toBe(method);
    }
  };
  await make();
  await make();
  await make();
});

afterAll(async () => {
  await cleanUpServers();
});
async function cleanUpServers() {
  const server = globalThis.Server;
  server?.server?.stop(true);
  server?.hotServer?.stop(true);
}
