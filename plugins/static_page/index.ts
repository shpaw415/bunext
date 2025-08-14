import type { DBSchema } from "../../database/schema";
import { CacheManagerExtends } from "../../internal/caching";
import type { staticPage } from "../../internal/types";
import { join } from "node:path";
import type { BunextPlugin } from "../types";
import type { RequestManager } from "../../internal/server/router";
import { renderToString } from "react-dom/server";
import { makeServerSideProps, type ServerSidePropsContext } from "plugins/server-features/serverSideProps";

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

async function GetServerSideProps(
  cacheManager: StaticPageCache,
  manager: RequestManager<ServerSidePropsContext>
) {
  if (!manager.serverSide) return false;
  const props = cacheManager.getStaticPageProps(manager.serverSide.pathname);
  if (props) return props;
  const serverSideProps = await makeServerSideProps(manager)
  if (serverSideProps) return serverSideProps;
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
    const pageJSX = await manager.makeDynamicJSXPage({
      serverSideProps: (
        await makeServerSideProps(manager, { disableSession: true })
      ),
    });
    if (!pageJSX)
      throw Error(
        `Error Caching page JSX from path: ${manager.serverSide.pathname}`
      );
    const PageWithLayouts = await manager.router.stackLayouts(
      manager.serverSide,
      pageJSX
    );
    const pageString = renderToString(await manager.WrapPageWithShell(PageWithLayouts));

    const props =
      GetServerSideProps(cacheManager, manager) ||
      (await makeServerSideProps(manager, { disableSession: true }));

    cacheManager.addStaticPage(
      manager.serverSide.pathname,
      pageString,
      props
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
  manager.bunextReq.session.prevent_session_init();

  const cacheManager = new StaticPageCache();
  const props = await makeServerSideProps(manager, { disableSession: true });
  const pageJSX = await manager.makeDynamicJSXPage({
    serverSideProps: props,
  });
  if (!pageJSX)
    throw Error(
      `Error Caching page JSX from path: ${manager.serverSide.pathname}`
    );
  const PageWithLayouts = await manager.router.stackLayouts(
    manager.serverSide,
    pageJSX
  );
  const pageString = renderToString(await manager.WrapPageWithShell(PageWithLayouts));

  cacheManager.addStaticPage(
    manager.serverSide.pathname,
    pageString,
    props
  );

  return pageString;
}

export default {
  priority: 0,
  router: {
    async request(manager) {
      if (process.env.NODE_ENV == "development") return;
      const isUseStatic = isUseStaticPath(manager, true);
      if (
        manager.request.headers.get("Accept")?.includes("text/html") &&
        isUseStatic
      ) {
        const stringPage =
          (await getStaticPage(manager)) || (await MakeStaticPage(manager));


        if (stringPage)
          manager.bunextReq.setResponse(stringPage || "", {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
      } else if (
        manager.request.headers
          .get("Accept")
          ?.includes("application/vnd.server-side-props") &&
        isUseStatic &&
        manager.serverSide
      ) {
        const cacheManager = new StaticPageCache();
        const staticData = cacheManager.getStaticFromURL(manager.request.url);
        if (!staticData) await MakeStaticPage(manager);
        const data = GetServerSideProps(cacheManager, manager);
        return manager.bunextReq.__BYPASS_RESPONSE__ = (
          new Response(data ? JSON.stringify(data) : null, {
            headers: {
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
