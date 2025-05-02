import { router } from "../../internal/server/router";
import type { BunextPlugin } from "../types";
import { normalize } from "path";

const regex = /\[[A-Za-z0-9]+\]/g;
/**
 * Creates a TypeScript union type definition for all application routes based on a JSON route dump.
 *
 * Dynamic segments in route paths (e.g., `[param]`) are replaced with `${string}` placeholders. Both normalized and original forms are included for routes with dynamic segments. Routes linked to layout files are excluded.
 *
 * @param routeDump - A JSON string representing the application's route mapping.
 * @returns A string containing the TypeScript type definition for `RoutesType`.
 */
export function makeType(routeDump: string) {
  const routes = Object.entries(JSON.parse(routeDump) as Record<string, string>)
    .filter(([key, val]) => !val.endsWith("layout.js"))
    .map(([key]) => key)
    .map((path) => {
      const pathArray = [normalize(path.replaceAll(regex, "${string}/"))];
      if (new RegExp(regex).test(path)) pathArray.push(path);
      return pathArray;
    })
    .flat();

  return `export type RoutesType = ${routes
    .map((route) => `\`${route}\``)
    .join(" | ")}`;
}

export default {
  async onFileSystemChange(filePath) {
    if (filePath == undefined) return;
    try {
      await Bun.write(
        `${import.meta.dirname}/type.ts`,
        makeType(router.routes_dump)
      );
    } catch (error) {
      console.error("❌ Failed to generate type-safe routes:", error);
    }
  },
} as BunextPlugin;
