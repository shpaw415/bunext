import { StaticRouters } from "@bunpmjs/bunext/bun-react-ssr";
import { mkdirSync, existsSync } from "node:fs";
import "@bunpmjs/bunext/internal/server_global";

if (!existsSync(".bunext/build/src/pages"))
  mkdirSync(".bunext/build/src/pages", { recursive: true });
export let router = new StaticRouters();
await router?.InitServerActions();
