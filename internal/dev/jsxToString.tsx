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
global.console.log = (...props) =>
  process.stdout.write(
    props.map((e) => JSON.stringify(e)).join("<!CONSOLE!>") + "<!CONSOLE!>"
  );

const jsx = await router.CreateDynamicPage(modulePath, props, match);

process.stdout.write(
  `<!BUNEXT_SEPARATOR!>${renderToString(jsx)}</!BUNEXT_SEPARATOR!>`
);
