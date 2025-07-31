import type { DBSchema } from "../../database/schema";
import { CacheManagerExtends } from "../../internal/caching";
import type { staticPage } from "../../internal/types";
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
      {
        name: "created_at",
        type: "number",
      },
      {
        name: "etag",
        type: "string",
      },
    ],
  },
];

// Singleton cache manager for performance
let globalCacheManager: StaticPageCache | null = null;

export class StaticPageCache extends CacheManagerExtends {
  private static_page = this.CreateTable<staticPage & { created_at: number; etag: string }, staticPage & { created_at: number; etag: string }>("static_page");

  constructor() {
    super({
      shema: staticPageCacheShema,
      dbPath: join(import.meta.dirname, "static_page.sqlite"),
    });
  }

  static getInstance(): StaticPageCache {
    if (!globalCacheManager) {
      globalCacheManager = new StaticPageCache();
    }
    return globalCacheManager;
  }

  addStaticPage(pathname: string, page: string, raw_props?: Object, etag?: string) {
    const now = Date.now();
    const pageEtag = etag || this.generateETag(page, raw_props);

    try {
      this.static_page.insert([
        {
          pathname,
          page,
          props: raw_props,
          created_at: now,
          etag: pageEtag,
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
              created_at: now,
              etag: pageEtag,
            },
          })
        )
      )
        throw e;
    }
  }

  private generateETag(page: string, props?: Object): string {
    const content = page + (props ? JSON.stringify(props) : '');
    return `"${Bun.hash(content).toString(16)}"`;
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
        await manager.makeServerSideProps({ disableSession: true })
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
      (await manager.makeServerSideProps({ disableSession: true }));

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
        req.request.headers
          .get("Accept")
          ?.includes("application/vnd.server-side-props") &&
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
