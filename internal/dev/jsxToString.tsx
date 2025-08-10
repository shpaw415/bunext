import { renderToString } from "react-dom/server";
import { router } from "../../internal/server/router";
import type { JSX } from "react";
import { BunextRequest } from "../server/bunextRequest";
import type { JsxToStringWorkerMessage } from "./types";
import { ErrorFallback } from "../../components/fallback";

const modulePath = process.env.module_path as string;
const props = JSON.parse(process.env.props as string) as {
  props: any;
  params: Record<string, unknown>;
};
const url = process.env.url as string;

const match = router.server?.match(url);

if (!match) process.exit(1);

let jsx: JSX.Element;

const req = new BunextRequest({
  request: new Request(url),
  response: new Response(),
});
req.path = match.name;

try {

  jsx = await router.CreateDynamicPage(modulePath, props, match, req);
  process.send?.({
    type: "jsxToString",
    jsx: renderToString(jsx),
    head: req.headData,
  } as JsxToStringWorkerMessage);

} catch (error) {
  Log(`Error creating dynamic page: `, error as Error);
  process.send?.({
    type: "jsxToString",
    jsx: renderToString(<ErrorFallback error={error as Error} />),
    head: req.headData,
  } as JsxToStringWorkerMessage);

}

function Log(message: string, error?: Error) {
  process.send?.({
    type: "error",
    error: error || new Error(message),
    message,
  } as JsxToStringWorkerMessage);
}

process.exit();
