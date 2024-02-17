import React from "react";
type _Script = {
  fn: Function;
  call?: boolean;
};

declare global {
  var scriptsList: Function[];
}
globalThis.scriptsList ??= [];

export function LoadScript() {
  return <script type="text/javascript" src="/bunext-scripts" />;
}

/**
 * @param fn (use \\\\\\n to insert \\n in string)
 */
export function addScriptToList(fn: Function) {
  globalThis.scriptsList.push(fn);
}
