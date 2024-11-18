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

let jsx: JSX.Element;

try {
  jsx = await router.CreateDynamicPage(modulePath, props, match);
  WriteToStdout(jsx);
} catch (e) {
  WriteToStdout(undefined);
  throw e;
}

function WriteToStdout(jsx: JSX.Element | undefined) {
  process.stdout.write(
    `<!BUNEXT_SEPARATOR!>${jsx ? renderToString(jsx) : ""}<!BUNEXT_SEPARATOR!>`
  );
}
