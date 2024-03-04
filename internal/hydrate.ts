"use client";
import { hydrate } from "@bunpmjs/bunext/bun-react-ssr/hydrate";
import { Shell } from "./shell";
import "../.bunext/react-ssr/global";

await hydrate(Shell as any);
