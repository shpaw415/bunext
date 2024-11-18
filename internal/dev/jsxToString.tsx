import { renderToString } from "react-dom/server";
import { router } from "@bunpmjs/bunext/internal/router";

const modulePath = process.env.module_path as string;
const props = JSON.parse(process.env.props as string) as {
  props: any;
  params: Record<string, string>;
};
const url = process.env.url as string;

const match = router.server?.match(url);

if (!match) process.exit(1);

let toLog: any[][] = [];
let jsx: JSX.Element;
global.console.log = (...props) => toLog.push(props);

jsx = await router.CreateDynamicPage(modulePath, props, match);
WriteToStdout(jsx, toLog);

function WriteToStdout(jsx: JSX.Element, toLog: any[][]) {
  process.stdout.write(
    `${renderToString(jsx)}<!BUNEXT_SEPARATOR!>${toLog.map((...e) =>
      console.log(...e)
    )}`
  );
}
