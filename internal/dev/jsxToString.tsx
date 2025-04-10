import { renderToString } from "react-dom/server";
import { router } from "../../internal/server/router";
import type { JSX } from "react";
import { BunextRequest } from "../server/bunextRequest";

const modulePath = process.env.module_path as string;
const props = JSON.parse(process.env.props as string) as {
  props: any;
  params: Record<string, string>;
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

jsx = await router.CreateDynamicPage(modulePath, props, match, req);

process.send?.({
  jsx: renderToString(jsx),
  head: req.headData,
});

process.exit();
