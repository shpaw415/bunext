import type { _globalThis } from "../internal/types";

export type _Head = {
  title?: string;
  author?: string;
  publisher?: string;
  meta?: React.DetailedHTMLProps<
    React.MetaHTMLAttributes<HTMLMetaElement>,
    HTMLMetaElement
  >[];
  link?: React.DetailedHTMLProps<
    React.LinkHTMLAttributes<HTMLLinkElement>,
    HTMLLinkElement
  >[];
};

class HeadDataClass {
  public head: Record<string, _Head> = {};
  public currentPath?: string;

  /**
   * @description
   * \<head\> data to be set
   * To be set in the page file
   * @example
   * setHead({data: {title: "my title"}});
   * "OR"
   *setHead({data: {
   *  title: "my title"
   * },
   *  path: "/"
   * }); // for other path (must be called within the src/pages folder)
   * @param path not mandatory but can be used to set head data for a page Ex: /users
   * @param data to be set
   */
  public setHead({ data, path }: { data: _Head; path: string }) {
    if (!this.head[path]) this.head[path] = data;
    else if (this.head[path])
      this.head[path] = deepMerge(this.head[path], data);
    else if (this.currentPath) this.head[this.currentPath] = data;
  }
  /**
   * DO NOT USE THIS FUNCTION
   * @param path path to the module index
   */
  public _setCurrentPath(path: string) {
    this.currentPath = path
      .split("pages")
      .slice(1)
      .join("pages")
      .replace("/index.tsx", "");
    if (this.currentPath.length == 0) this.currentPath = "/";
  }
}

const Head = new HeadDataClass();

function deepMerge(obj: _Head, assign: _Head): _Head {
  const copy = structuredClone(obj);
  for (const key of Object.keys(assign) as Array<keyof _Head>) {
    switch (key) {
      case "author":
      case "publisher":
      case "title":
        copy[key] = assign[key];
        break;
      case "link":
      case "meta":
        if (copy[key]) copy[key].push(...(assign[key] as any));
        else copy[key] = assign[key] as any;
        break;
    }
  }
  return copy;
}

function HeadElement({ currentPath }: { currentPath: string }) {
  const globalX = globalThis as unknown as _globalThis;

  const data =
    typeof window != "undefined"
      ? deepMerge(
          globalX.__HEAD_DATA__["*"] || {},
          globalX.__HEAD_DATA__[currentPath]
        )
      : deepMerge(Head.head["*"] || {}, Head.head[currentPath]);

  return (
    <head>
      {data?.title && <title>{data.title}</title>}
      {data?.author && <meta name="author" content={data.author} />}
      {data?.publisher && <meta name="publisher" content={data.publisher} />}
      {data?.meta && data.meta.map((e, index) => <meta key={index} {...e} />)}
      {data?.link && data.link.map((e, index) => <link key={index} {...e} />)}
    </head>
  );
}

export { Head, HeadElement };
