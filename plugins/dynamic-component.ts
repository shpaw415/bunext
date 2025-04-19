import { renderToString } from "react-dom/server";
import "../internal/server/server_global";
import type { BunextPlugin } from "./types";
import { resolve } from "path";
import type { JSX } from "react";

declare global {
  var __BUNEXT_dynamicComponents__: Array<dynamicComponents>;
}

type dynamicComponents = {
  id: string;
  content: string;
  pathname: string;
  element: {
    type: keyof JSX.IntrinsicElements;
    props: Record<string, any>;
  };
};

const cwd = process.cwd();

async function MakeEntryPoints() {
  const dynamicPaths = globalThis.serverConfig.router?.dynamicPaths;
  if (!dynamicPaths) return [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx,css}");
  const cwd = process.cwd();

  const entrypoints = (
    await Promise.all(
      dynamicPaths?.map((path) =>
        Array.fromAsync(
          glob.scan({
            cwd: resolve(cwd, path),
            absolute: true,
          })
        )
      )
    )
  ).reduce((p, n) => [...p, ...n], []);

  return entrypoints;
}
const entrypoints = await MakeEntryPoints();

export default {
  build: { buildOptions: { entrypoints } },
  router: {
    html_rewrite: {
      initContext() {
        return [];
      },
      rewrite(rewrite, bunext_req, context) {
        rewrite.on(".BUNEXT_Dynamic_Element", {
          async element(element) {
            const id = element.getAttribute("id");
            if (!id) return;
            const pathName = element.getAttribute("pathname");
            const elementName = element.getAttribute("elementname");
            const _props = element.getAttribute("props");
            if (!pathName || !elementName)
              throw new Error(
                JSON.stringify({ id, pathName, elementName, props: _props })
              );

            const props = _props
              ? (JSON.parse(decodeURI(_props)) as {})
              : undefined;
            const JSXElement = (await (
              await import(`${cwd}/${pathName}`)
            )[elementName](props)) as JSX.Element;
            const JSXElementStringified = renderToString(JSXElement);

            const { children, ...props_without_child } = JSXElement.props;

            context.push({
              id,
              content: encodeURI(JSXElementStringified),
              pathname: new URL(bunext_req.request.url).pathname,
              element: {
                type: JSXElement.type,
                props: props_without_child,
              },
            });

            element.replace(
              `<${JSXElement.type}>${JSXElementStringified}</${JSXElement.type}>`,
              {
                html: true,
              }
            );
          },
        });
        rewrite.onDocument({
          end(end) {
            end.append(
              `<script> 
              __BUNEXT_dynamicComponents__=JSON.parse('${JSON.stringify(
                context
              )}'); </script>`,
              {
                html: true,
              }
            );
          },
        });
      },
    },
  },
} as BunextPlugin<Array<dynamicComponents>>;
