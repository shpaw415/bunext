import { router } from "../../internal/server/router";
import type { BunextPlugin } from "../types";

/**
 * Generates a TypeScript union type definition representing all application routes.
 *
 * Dynamic route segments (e.g., `[param]`) are replaced with `${string}` template placeholders. Routes associated with layout files are excluded.
 *
 * @returns A string containing the TypeScript type definition for `RoutesType`.
 */
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
      try {
        await Bun.write(`${import.meta.dirname}/type.ts`, makeType());
        console.log("✅ Generated type-safe routes");
      } catch (error) {
        console.error("❌ Failed to generate type-safe routes:", error);
      }
    },
  },
} as BunextPlugin;
