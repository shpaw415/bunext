"use client";
import { createElement, useEffect, useState, type JSX } from "react";
import { useLoadingVersion } from "../../internal/router/index";
import { makeDocURL } from "../../internal/documentation/paths";

/**
 * @dev this is related with plugins/router/html_rewrite/dynamic_components.ts
 * @param id must be unique in page and cannot be random **Required to make it SSR**
 * @returns
 */
export function DynamicComponent<T extends {}>({
  pathName,
  elementName,
  bootStrap,
  props,
  onError,
  id,
}: {
  pathName: string;
  elementName: string;
  bootStrap?: Partial<{
    style: string[];
  }>;
  props?: T;
  onError?: () => void;
  id?: string;
}) {
  const [El, setEl] = useState<JSX.Element | undefined>(() => {
    if (typeof window == "undefined")
      return createElement("div", {
        className: "BUNEXT_Dynamic_Element",
        id,
        pathname: pathName,
        elementname: elementName,
        props: encodeURI(JSON.stringify(props)),
      });

    if (id) {
      const El = globalThis.__BUNEXT_dynamicComponents__.find(
        (p) => p.id == id
      );
      if (!El) return undefined;
      return createElement(El.elementType, {
        dangerouslySetInnerHTML: {
          __html: El.content,
        },
      });
    }
    return undefined;
  });
  const version = useLoadingVersion();
  const devKey = process.env.NODE_ENV == "development" ? `?${version}` : "";

  useEffect(() => {
    import(`${pathName}${devKey}`)
      .then((module) => {
        const Component = module[elementName];
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
