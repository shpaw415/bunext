"use client";
import type { _Head } from "@bunpmjs/bunext/componants/head";

declare global {
  var head: { [key: string]: _Head };
  var mode: "dev" | "prod";
}

globalThis.mode ??= "dev";
