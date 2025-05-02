import { test, expect } from "bun:test";
import { makeType } from ".";

const mustBe =
  "export type RoutesType = `/foo/${string}/` | `/foo/[id]` | `/sub` | `/bar/foo/${string}/` | `/bar/foo/[id]`";

test("typed-route-plugin", () => {
  const routes = {
    "/foo/[id]": "/foo/[id]/index.js",
    "/sub": "/sub/index.js",
    "/sub/layout": "/sub/layout.js",
    "/bar/foo/[id]": "/bar/foo/[id].js",
  };
  const types = makeType(JSON.stringify(routes));
  expect(types).toBe(mustBe);
});
