import type { webToken } from "@bunpmjs/json-webtoken";
import { setHeadData, type headerData } from "../src/head";
import type { Server, ServerWebSocket } from "bun";

declare global {
  var server: Server | undefined;
  var hotServer: Server | undefined;
  var wsList: ServerWebSocket<unknown>[];
  var mode: "dev" | "debug";
  var head: headerData;
  // response data
  var responseData: JSX.Element;
  var scripts: JSX.Element[];
  var compiledScript: JSX.Element;

  // session
  var session: webToken<unknown>;
  var sessionRemove: boolean;
  var setSession:
    | {
        expire: number;
        httpOnly: boolean;
        secure: boolean;
      }
    | undefined;
}

export default function init() {
  globalThis.server ??= undefined;
  globalThis.hotServer ??= undefined;
  globalThis.wsList ??= [];
  globalThis.mode ??= "dev";
  globalThis.responseData;
  globalThis.scripts ??= [];
  globalThis.compiledScript;
  globalThis.head ??= {};
  globalThis.setSession ??= undefined;
  globalThis.sessionRemove ??= false;

  setHeadData({
    charSet: "UTF-8",
    viewport: "width=device-width, initial-scale=1",
    title: "BuNext-App",
  });
}
