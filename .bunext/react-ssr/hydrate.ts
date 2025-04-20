"use client";
import { hydrate } from "bunext-js/internal/hydrate.tsx";
import { Shell } from "./shell";
import "bunext-js/internal/globals.ts";
import "bunext-js/internal/client/bunext_global.ts";

await hydrate(Shell as any);
