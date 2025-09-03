"use client";
import { createElement, useEffect, useState, type JSX } from "react";
import { useLoadingVersion } from "internal/router";
import { makeDocURL } from "internal/documentation/paths";

export type DynamicComponentProps<Props extends {}, ElementName extends string> = {
  pathName: string;
  elementName: ElementName;
  bootStrap?: Partial<{
    style: string[];
  }>;
  props?: Props;
  onError?: () => void;
  fallback?: JSX.Element;
  id: string;
};

export const BUNEXT_Dynamic_Element = "BUNEXT_Dynamic_Element";
export const BUNEXT_Dynamic_Element_PREFIX = "BUNEXT_Dynamic_Element_";

/**
 * @dev this is related with plugins/router/html_rewrite/dynamic_components.ts
 * @param id must be unique in page and cannot be random **Required to make it SSR**
 * @param pathName path to the module
 * @param elementName exported name of the element from the module to render
 * @param bootStrap optional styles to load array<filePath>
 * @returns
 */
export function DynamicComponent<Props extends {}, ElementName extends string>({
  pathName,
  elementName,
  bootStrap,
  props,
  onError,
  fallback,
  id,
}: DynamicComponentProps<Props, ElementName>) {
  const [El, setEl] = useState<JSX.Element | undefined>(() => {
    if (typeof window == "undefined")
      return createElement("div", {
        className: [BUNEXT_Dynamic_Element, BUNEXT_Dynamic_Element_PREFIX + id].join(" "),
        id,
        pathname: pathName,
        elementname: elementName,
        props: encodeURI(JSON.stringify(props)),
      });

    if (id) {
      const El = globalThis?.__BUNEXT_DYNAMIC_COMPONENTS__?.find(
        (p) => p.id == id
      );
      if (!El) return fallback;
      return createElement(El.element.type, {
        dangerouslySetInnerHTML: {
          __html: document.getElementsByClassName(El.id)?.[0]?.innerHTML,
        },
      });
    }
    return undefined;
  });
  const version = useLoadingVersion();
  const devKey = process.env.NODE_ENV == "development" ? `?v=${version}` : "";
  useEffect(() => {
    import(`${pathName}.js${devKey}`)
      .then((module) => {
        console.log({ module, elementName })
        const Component = module[elementName];
        if (!Component) {
          throw new Error(`Component ${elementName} not found in module ${pathName}`);
        }
        setEl(<Component {...props} />);
      })
      .catch((error) => {
        console.error(
          "Error loading component:",
          error,
          `\nDid you correctly configure the plugin for loading Dynamic components?\n${makeDocURL(
            "dynamicComponents"
          )}`
        );
        setEl(<></>);
        onError?.();
      });
  }, [pathName, elementName, version]);

  return (
    <>
      {bootStrap?.style?.map((style) => (
        <link key={style} href={`${style}${devKey}`} rel="stylesheet" />
      ))}
      {El ?? <></>}
    </>
  );
}
