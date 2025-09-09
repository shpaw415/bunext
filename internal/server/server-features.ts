import { renderToString } from "react-dom/server";
import { type JSX } from "react";


export async function MakeDynamicComponent({
  id,
  pathName,
  elementName,
  props,
}: {
  id: string;
  pathName: string;
  elementName: string;
  props: any;
}) {
  const elem = (await import(pathName))?.[elementName]?.(props) as JSX.Element;
  return {
    id,
    content: renderToString(elem),
    elementType: elem.type as keyof JSX.IntrinsicElements,
  };
}

