import { test, expect, describe, afterAll } from "bun:test";

import "../internal/server_global.ts";
import { builder } from "../internal/build";
import { revalidate } from "../features/router.ts";
import { rmSync, mkdirSync } from "fs";
import { router } from "../internal/router.tsx";

process.env.__TEST_MODE__ = "true";

const getServer = async () =>
  (await import("../.bunext/react-ssr/server.ts")).Server;

describe("Build features", () => {
  test("Build", async () => {
    const buildOut = await builder.makeBuild();
    expect(buildOut?.ssrElement.length).toBe(2);
    expect(buildOut?.revalidates.length).toBe(1);
    const buildOutputs = await builder.build();
    expect(buildOutputs.success).toBe(true);
    const matched = router.client?.match("/");
    expect(matched).not.toBe(null);
  });

  test("revalidate", async () => {
    await revalidate("/");
  });
});

describe("Server Features", () => {
  test("start server", async () => {
    const server = await getServer(); // serverStart auto
    expect(server.server).not.toBe(undefined);

    const res = await fetch(`http://localhost:${server.port}/`);
    expect(res.ok).toBe(true);
  });

  test("start hotServer", async () => {
    const server = await getServer();
    server.serveHotServer(3001);
    expect(server.hotServer).not.toBe(undefined);
    const promiseRes = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.hotServerPort}`);
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
    expect(
      Array.prototype.concat(...router.serverActions.map((e) => e.actions))
        .length
    ).toBe(1);
    const form = new FormData();
    form.append("props", encodeURI(JSON.stringify([])));
    const res = await fetch(
      `http://localhost:${(await getServer()).port}/ServerActionGetter`,
      {
        headers: {
          serveractionid: "/index.tsx:ServerAction",
        },
        body: form,
        method: "POST",
      }
    );
    expect(JSON.parse(await res.text()).props).toBe(true);
  });
});

afterAll(async () => {
  cleanUpBuild();
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
