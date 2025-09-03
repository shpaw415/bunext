import { renderToString } from "react-dom/server";
import "internal/server/server_global";
import type { BunextPlugin } from "./types";
import { join, resolve, normalize } from "path";
import type { JSX } from "react";

declare global {
  var __BUNEXT_DYNAMIC_COMPONENTS__: Array<dynamicComponents>;
}

type dynamicComponents = {
  id: string;
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
  ).flat();

  return entrypoints;
}
const entrypoints = await MakeEntryPoints();

export default {
  name: "bunext-dynamic-component-plugin",
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
              ? (JSON.parse(decodeURI(_props)) as unknown)
              : undefined;
            // Validate and resolve the import path
            const absPath = normalize(join(cwd, pathName));
            if (!absPath.startsWith(cwd)) {
              throw new Error(
                `Dynamic component outside project root: ${pathName}, absPath: ${absPath}`
              );
            }

            // Import the module and retrieve the component
            const mod = await import(absPath);
            const Component = mod?.[elementName] as (
              props: unknown
            ) => JSX.Element;

            if (!Component) {
              throw new Error(`Component ${elementName} not found in module ${pathName}`);
            }

            // Render the component
            const JSXElement = Component(props) as JSX.Element;
            const JSXElementStringified = renderToString(JSXElement);

            const { children, ...props_without_child } = JSXElement.props;

            context.push({
              id,
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
            bunext_req.bunextReq.InjectGlobalValues({
              __BUNEXT_DYNAMIC_COMPONENTS__: context,
            })
          },
        });
      },
    },
  },
} as BunextPlugin<Array<dynamicComponents>>;
