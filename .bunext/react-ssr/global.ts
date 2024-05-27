"use client";
import type { _Head } from "@bunpmjs/bunext/componants/head";

declare global {
  var head: { [key: string]: _Head };
  var __NODE_ENV__: "development" | "production";
}

globalThis.__NODE_ENV__ ??= "development";
