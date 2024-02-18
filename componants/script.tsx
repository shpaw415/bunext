import React from "react";

let scriptsList: Function[] = [];

export function LoadScript() {
  return <script type="text/javascript" src="/bunext-scripts" />;
}

export function addScript(fn: Function) {
  scriptsList.includes(fn) ? null : scriptsList.push(fn);
}

export function getScriptsList() {
  return scriptsList;
}
