import { Script } from "./jsx-utils";
import { fnToString } from "./utils";

declare global {
  var header: headerData;
}

interface headerData {
  metaData?: MetaData[];
  charSet?: "utf-8";
  viewport?: string;
}
interface MetaData {
  [key: string]: string;
}
/*
export function setHeaderScript() {
  return <Script src={}></Script>;
}*/

function setheaderData({ metaData, charSet, viewport }: headerData) {
  globalThis.header.metaData = metaData || [];
  globalThis.header.charSet = charSet || "utf-8";
  globalThis.header.viewport =
    viewport || "width=device-width, initial-scale=1";
}

export function _setHeaderData() {
  const transpiler = new Bun.Transpiler({
    loader: "ts",
  });
  return transpiler.transformSync(fnToString(_test));
}

function _test() {
  const i: number = 0;
  console.log(i);
}
