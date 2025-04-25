import "../internal/server/bunext_global.ts";
import { test, expect, describe, afterAll } from "bun:test";

import "bunext-js/internal/server/server_global.ts";
import { router } from "bunext-js/internal/server/router.tsx";
import "../.bunext/react-ssr/server.ts";
import { Shell } from "../.bunext/react-ssr/shell.tsx";
import { ParseServerSideProps } from "../internal/router/index.tsx";

const Server = globalThis.Server;

describe("Server Features", () => {
  test("start server", async () => {
    expect(Server).not.toBe(undefined);
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

describe("Build features", () => {
  /*test.skip("Build", async () => {
    const { builder } = await import("bunext-js/internal/build");
    const buildOut = await builder.testBuild();
    expect(buildOut?.ssrElement.length).toBeGreaterThan(0);
    expect(buildOut?.revalidates.length).toBeGreaterThan(0);
    router.setRoutes();
    const matched = router.client?.match("/");
    expect(matched).not.toBe(null);
  });*/

  test("revalidate", async () => {
    const { revalidate } = await import(
      "bunext-js/features/router/revalidate.ts"
    );
    await revalidate("/");
  });

  test("Header data", async () => {
    const { Head } = await import("bunext-js/features/head.tsx");
    expect(Object.keys(Head.head).length).toBeGreaterThan(1);
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

describe("Request features", () => {
  test("server-side-props:DEFINED", async () => {
    const headers = {
      accept: "application/vnd.server-side-props",
    };
    const req = new Request(
      `http://localhost:${serverConfig.HTTPServer.port}/serversideprops`,
      {
        headers: {
          accept: "application/vnd.server-side-props",
        },
      }
    );
    const res = await router.serve(req, headers, new FormData(), {
      Shell: Shell as any,
    });
    if (!res?.response) throw new Error("No response");
    const parsed = ParseServerSideProps(await res.response.text());
    expect(parsed?.test).toBe(true);
  });
  test("server-side-props:UNDEFINED", async () => {
    const headers = {
      accept: "application/vnd.server-side-props",
    };
    const req = new Request(
      `http://localhost:${serverConfig.HTTPServer.port}/serversideprops/undefined`,
      {
        headers: {
          accept: "application/vnd.server-side-props",
        },
      }
    );
    const res = await router.serve(req, headers, new FormData(), {
      Shell: Shell as any,
    });
    if (!res?.response) throw new Error("No response");
    const parsed = ParseServerSideProps(await res.response.text());
    expect(parsed).toBeUndefined();
  });

  test("server-side-props:STATIC:DEFINED", async () => {
    const make = async () => {
      const headers = {
        accept: "application/vnd.server-side-props",
      };
      const req = new Request(
        `http://localhost:${serverConfig.HTTPServer.port}/serversideprops/static`,
        {
          headers: {
            accept: "application/vnd.server-side-props",
          },
        }
      );
      const res = await router.serve(req, headers, new FormData(), {
        Shell: Shell as any,
      });
      if (!res?.response) throw new Error("No response");
      const parsed = ParseServerSideProps(await res.response.text());
      expect(parsed?.redirect).toBe("/");
      expect(parsed?.params).toEqual({});
    };
    await make();
    await make();
  });
  test("server-side-props:STATIC:UNDEFINED", async () => {
    const make = async () => {
      const headers = {
        accept: "application/vnd.server-side-props",
      };
      const req = new Request(
        `http://localhost:${globalThis.serverConfig.HTTPServer.port}/serversideprops/static/undefined`,
        {
          headers: {
            accept: "application/vnd.server-side-props",
          },
        }
      );
      const res = await router.serve(req, headers, new FormData(), {
        Shell: Shell as any,
      });
      if (!res?.response) throw new Error("No response");
      const parsed = ParseServerSideProps(await res.response.text());
      expect(parsed).toBeUndefined();
    };
    await make();
    await make();
  });

});

afterAll(async () => {
  await cleanUpServers();
});
async function cleanUpServers() {
  const server = globalThis.Server;
  server?.server?.stop(true);
  server?.hotServer?.stop(true);
}
