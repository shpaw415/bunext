import type { DBSchema } from "../../database/schema";
import { CacheManagerExtends } from "../../internal/caching";
import type { ServerSideProps, staticPage } from "../../internal/types";
import { join } from "node:path";
import type { BunextPlugin } from "../types";
import type { RequestManager } from "../../internal/server/router";
import { renderToString } from "react-dom/server";

const staticPageCacheShema: DBSchema = [
  {
    name: "static_page",
    columns: [
      {
        name: "pathname",
        type: "string",
        unique: true,
        primary: true,
      },
      {
        name: "page",
        type: "string",
      },
      {
        name: "props",
        type: "json",
        nullable: true,
        DataType: {},
      },
    ],
  },
];

export class StaticPageCache extends CacheManagerExtends {
  private static_page = this.CreateTable<staticPage, staticPage>("static_page");

  constructor() {
    super({
      shema: staticPageCacheShema,
      dbPath: join(import.meta.dirname, "static_page.sqlite"),
    });
  }

  addStaticPage(pathname: string, page: string, raw_props?: Object) {
    try {
      this.static_page.insert([
        {
          pathname,
          page,
          props: raw_props,
        },
      ]);
    } catch (e) {
      if (
        !this.isPrimaryError(e as Error, () =>
          this.static_page.update({
            where: {
              pathname,
            },
            values: {
              page,
              props: raw_props,
            },
          })
        )
      )
        throw e;
    }
  }
  getStaticFromURL(url: string) {
    const _url = new URL(url);
    return this.static_page
      .select({
        where: {
          pathname: _url.pathname,
        },
        select: {
          props: true,
        },
      })
      .at(0);
  }
  getStaticPage(url: string): staticPage | undefined {
    const _url = new URL(url);
    return (this.static_page
      .select({
        where: {
          pathname: _url.pathname,
        },
        select: {
          page: true,
          props: true,
        },
      })
      .at(0) ?? undefined) as
      | (Omit<staticPage, "props"> & { props: string })
      | undefined;
  }
  getStaticPageProps(pathname: string) {
    return (
      (this.static_page
        .select({
          where: {
            pathname,
          },
          select: {
            props: true,
          },
        })
        .at(0) ?? undefined) as staticPage | undefined
    )?.props;
  }
  removeStaticPage(pathname: string) {
    this.static_page.delete({
      where: {
        pathname,
      },
    });
  }
  clearStaticPage() {
    this.static_page.databaseInstance.run("DELETE FROM static_page");
  }
}

function isUseStaticPath(
  manager: RequestManager,
  andProduction?: boolean
): boolean {
  if (andProduction && process.env.NODE_ENV != "production") return false;
  return Boolean(
    manager.serverSide &&
      manager.router.staticRoutes.includes(manager.serverSide?.name)
  );
}

function GetServerSideProps(
  cacheManager: StaticPageCache,
  manager: RequestManager
) {
  if (manager.serverSideProps) return manager.serverSideProps;

  if (!manager.serverSide) return null;
  const props = cacheManager.getStaticPageProps(manager.serverSide.pathname);
  if (props) {
    manager.serverSideProps = {
      toString: () => JSON.stringify(props),
      value: props,
    };
    return manager.serverSideProps;
  }
  return null;
}

/**
 * get static page or add it to the cache if it does not exists
 */
async function getStaticPage(manager: RequestManager) {
  if (!manager.serverSide) return null;
  const cacheManager = new StaticPageCache();
  const cache = cacheManager.getStaticPage(manager.request.url);
  if (!cache) {
    const pageJSX = await manager.MakeDynamicJSXElement({
      serverSideProps: (
        await manager.MakeServerSideProps({ disableSession: true })
      ).value,
    });
    if (!pageJSX)
      throw Error(
        `Error Caching page JSX from path: ${manager.serverSide.pathname}`
      );
    const PageWithLayouts = await manager.router.stackLayouts(
      manager.serverSide,
      pageJSX
    );
    const pageString = await manager.formatPage(
      renderToString(await manager.makePage(PageWithLayouts))
    );

    const props =
      GetServerSideProps(cacheManager, manager) ||
      (await manager.MakeServerSideProps({ disableSession: true }));

    cacheManager.addStaticPage(
      manager.serverSide.pathname,
      pageString,
      props.value
    );
    return pageString;
  }

  return cache.page;
}
/**
 * Make and cache the result
 * @returns
 */
async function MakeStaticPage(manager: RequestManager) {
  if (!manager.serverSide)
    throw new Error(`no serverSide path found for ${manager.pathname}`);
  process.env.__SESSION_MUST_NOT_BE_INITED__ = "true";
  const cacheManager = new StaticPageCache();
  const props = await manager.MakeServerSideProps({ disableSession: true });
  const pageJSX = await manager.MakeDynamicJSXElement({
    serverSideProps: props?.value,
  });
  if (!pageJSX)
    throw Error(
      `Error Caching page JSX from path: ${manager.serverSide.pathname}`
    );
  const PageWithLayouts = await manager.router.stackLayouts(
    manager.serverSide,
    pageJSX
  );
  const pageString = await manager.formatPage(
    renderToString(await manager.makePage(PageWithLayouts))
  );

  cacheManager.addStaticPage(
    manager.serverSide.pathname,
    pageString,
    props?.value
  );

  return pageString;
}

export default {
  router: {
    async request(req, manager) {
      if (process.env.NODE_ENV == "development") return;
      const isUseStatic = isUseStaticPath(manager, true);
      if (
        req.request.headers.get("Accept")?.includes("text/html") &&
        isUseStatic
      ) {
        const stringPage =
          (await getStaticPage(manager)) || (await MakeStaticPage(manager));
        if (stringPage)
          return req.__SET_RESPONSE__(
            new Response(Buffer.from(Bun.gzipSync(stringPage || "")), {
              headers: {
                "content-type": "text/html; charset=utf-8",
                "Content-Encoding": "gzip",
              },
            })
          );
      } else if (
        req.request.headers.get("Accept") ==
          "application/vnd.server-side-props" &&
        isUseStatic &&
        manager.serverSide
      ) {
        const cacheManager = new StaticPageCache();
        const staticData = cacheManager.getStaticFromURL(manager.request.url);
        if (!staticData) await MakeStaticPage(manager);

        return req.__SET_RESPONSE__(
          new Response(GetServerSideProps(cacheManager, manager)?.toString(), {
            headers: {
              ...req.response.headers,
              "Content-Type": "application/vnd.server-side-props",
              "Cache-Control": "no-store",
            },
          })
        );
      }
    },
  },
  serverStart: {
    main() {
      new StaticPageCache().clearStaticPage();
    },
  },
} as BunextPlugin;
