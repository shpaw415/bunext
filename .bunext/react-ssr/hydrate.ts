"use client";
import { hydrate } from "@bunpmjs/bunext/internal/hydrate.tsx";
import { Shell } from "./shell";
import "@bunpmjs/bunext/internal/globals.ts";
import "@bunpmjs/bunext/internal/client/bunext_global.ts";

await hydrate(Shell as any);
