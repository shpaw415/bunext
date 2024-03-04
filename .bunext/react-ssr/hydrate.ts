"use client";
import { hydrate } from "@bunpmjs/bunext/bun-react-ssr/hydrate";
import { Shell } from "./shell";
import "./global";

await hydrate(Shell as any);
