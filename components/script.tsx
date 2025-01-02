declare global {
  var scriptsList: Function[];
}

globalThis.scriptsList ??= [];

export function addScript(fn: Function) {
  globalThis.scriptsList.includes(fn) ? null : globalThis.scriptsList.push(fn);
}
