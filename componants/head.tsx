// TODO: make it only avalable from the request and not global
import type { _globalThis } from "../internal/types";
export type _Head = {
  title?: string;
  author?: string;
  publisher?: string;
  meta?: {
    name: string;
    content: string;
  }[];
};

declare global {
  /** the key is the path to the page  */
  var head: { [key: string]: _Head };
  var currentPath: string;
}
globalThis.currentPath ??= "";
globalThis.head ??= {};

export function Head({ currentPath }: { currentPath: string }) {
  const globalX = globalThis as unknown as _globalThis;
  const data = globalX.__HEAD_DATA__[currentPath];
  if (!data) return <head></head>;
  return (
    <head>
      {data?.meta?.map((e) => (
        <meta name={e.name} content={e.content} key={e.name} />
      ))}
      {Object.keys(data || {})
        .filter((n) => n != "meta")
        .map((e) => {
          const val = data[e as keyof _Head] as string;
          if (e === "title") return <title key={e}>{val}</title>;
          return <meta name={e} content={val} key={e} />;
        })}
    </head>
  );
}
/**
 * @description
 * "\<head\> data to be set
 * To be exported outside of a page and will be set for the current page"
 * @example
 * export setHead({data: {title: "my title"}});
 * "OR"
 *setHead({data: {
 *  title: "my title"
 * },
 *  path: "/"
 * })
 * @param path not mandatory but can be used to set head data for a page Ex: /users
 * @param data to be set
 */
export function setHead({ data, path }: { data: _Head; path?: string }) {
  if (path) globalThis.head[path] = data;
  globalThis.head[globalThis.currentPath] = data;
}
