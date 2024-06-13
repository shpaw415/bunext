import { test } from "bun:test";

test("Build", async () => {
  await import("../internal/buildv2.ts");
});
