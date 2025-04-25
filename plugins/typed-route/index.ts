import { router } from "../../internal/server/router";
import type { BunextPlugin } from "../types";

function makeType() {
  const routes = Object.entries(
    JSON.parse(router.routes_dump) as Record<string, string>
  )
    .filter(([key, val]) => !val.endsWith("layout.js"))
    .map(([key]) => key)
    .map((path) => path.replaceAll(/\[[A-Za-z0-9]+\]/g, "${string}"));

  return `export type RoutesType = ${routes
    .map((route) => `\`${route}\``)
    .join(" | ")}`;
}

export default {
  serverStart: {
    async dev() {
      await Bun.write(`${import.meta.dirname}/type.ts`, makeType());
    },
  },
} as BunextPlugin;
