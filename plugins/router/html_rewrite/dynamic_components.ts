import { renderToString } from "react-dom/server";
import type { HTML_Rewrite_plugin_function } from "./types";
import { type JSX } from "react";

const cwd = process.cwd();

const Rewrite_Plugin: HTML_Rewrite_plugin_function = (rewrite, bunext_req) => {
  const components: Array<{
    id: string;
    content: string;
    elementType: React.ReactElement<any, any>;
  }> = [];

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

      const props = _props ? (JSON.parse(decodeURI(_props)) as {}) : undefined;
      const JSXElement = (await (
        await import(`${cwd}/${pathName}`)
      )[elementName](props)) as JSX.Element;
      const JSXElementStringified = renderToString(JSXElement);

      components.push({
        id,
        content: encodeURI(JSXElementStringified),
        elementType: JSXElement.type,
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
        `<script> __BUNEXT_dynamicComponents__=[${components.map(
          ({ id, content, elementType }) =>
            `{id:"${id}", content:decodeURI("${content}"), elementType:"${elementType}"}`
        )}] </script>`,
        {
          html: true,
        }
      );
    },
  });
};

export default Rewrite_Plugin;
