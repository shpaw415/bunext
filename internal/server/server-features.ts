import { renderToString } from "react-dom/server";
import { revalidate } from "../../features/router/revalidate";
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

declare global {
  //@ts-ignore
  var __BUNEXT_dynamicComponents__: Array<{
    id: string;
    content: string;
    elementType: keyof JSX.IntrinsicElements;
  }>;
}

export type FeatureType = {
  globalData: Record<string, string>;
};

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
