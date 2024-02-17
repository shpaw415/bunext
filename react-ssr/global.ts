import type { _Head } from "@bunpmjs/bunext/componants/head";

declare global {
  var head: _Head;
  var mode: "dev" | "release";
}

globalThis.mode ??= "dev";
