import React from "react";

declare global {
  var scriptsList: Function[];
}
globalThis.scriptsList ??= [];

export function LoadScript() {
  return <script type="text/javascript" src="/bunext-scripts" />;
}

export function addScript(fn: Function) {
  globalThis.scriptsList.includes(fn) ? null : globalThis.scriptsList.push(fn);
}
export function resetScript() {
  globalThis.scriptsList = [];
}
