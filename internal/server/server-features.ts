import { renderToString } from "react-dom/server";
import { revalidate } from "plugins/server-features/ssr-page";
import { type JSX } from "react";
function setRevalidate(
  revalidates: {
    path: string;
    time: number;
  }[]
) {
  for (const reval of revalidates) {
    setInterval(async () => {
      await revalidate(reval.path);
    }, reval.time);
  }
}

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

export { setRevalidate };
