"use client";
import { hydrate } from "@bunpmjs/bunext/internal/hydrate.tsx";
import { Shell } from "./shell";
import "@bunpmjs/bunext/internal/globals";

await hydrate(Shell as any);
