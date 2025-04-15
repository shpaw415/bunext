import { renderToString } from "react-dom/server";
import type { HTML_Rewrite_plugin_function } from "./types";
import { type JSX } from "react";
import { type dynamicComponents } from "../assets/dynamic_components/types";

declare global {
  //@ts-ignore
  var __BUNEXT_dynamicComponents__: Array<dynamicComponents>;
}

const cwd = process.cwd();

const Rewrite_Plugin: HTML_Rewrite_plugin_function<Array<dynamicComponents>> = {
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
};

export default Rewrite_Plugin;
