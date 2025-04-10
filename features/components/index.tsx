"use client";
import { useEffect, useState, type JSX } from "react";
import { useLoadingVersion } from "../../internal/router/index";

declare global {
  /**
   * { [id]: Dynamic_Components_Content }
   */
  var __DynamicComponents__: Array<Record<string, string>>;
}

/**
 *
 * @param id must be unique in the app but cannot be random
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
  const [El, setEl] = useState<JSX.Element>();
  const version = useLoadingVersion();
  const devKey = process.env.NODE_ENV == "development" ? `?${version}` : "";

  useEffect(() => {
    import(`${pathName}${devKey}`)
      .then((module) => {
        const Component = module[elementName];
        setEl(<Component {...props} />);
      })
      .catch((error) => {
        console.error("Error loading component:", error);
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
