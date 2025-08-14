import type { DBSchema } from "../../database/schema";
import { CacheManagerExtends } from "../../internal/caching";
import type { staticPage } from "../../internal/types";
import { join } from "node:path";
import type { BunextPlugin } from "../types";
import type { RequestManager } from "../../internal/server/router";
import { renderToString } from "react-dom/server";
import { makeServerSideProps, type ServerSidePropsContext } from "plugins/server-features/serverSideProps";
import { isAskingHTML } from "plugins/server-features/ssr-page";

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

  addStaticPage(pathname: string, page: string, raw_props?: {}, etag?: string) {
    const now = Date.now();
    const pageEtag = etag || this.generateETag(page, raw_props);
    this.static_page.upsert([
      {
        pathname,
        page,
        props: raw_props,
        created_at: now,
        etag: pageEtag,
      },
    ], ["pathname"]);
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
  exists(pathname: string) {
    return this.static_page.exists({
      where: {
        pathname,
      },
    });
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
    return false;
  }

  return { page: cache.page, props: cache.props };
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
  return { page: pageString, props };
}

export default {
  priority: 0,
  router: {
    async request(manager) {
      if (process.env.NODE_ENV == "development" || manager.bunextReq.isResponseSetted()) return;
      await setServerSidePropsContext(manager);
      const isUseStatic = isUseStaticPath(manager, true);
      if (
        isAskingHTML(manager.bunextReq) &&
        isUseStatic
      ) {
        const { page, props } =
          (await getStaticPage(manager)) || (await MakeStaticPage(manager));


        manager.bunextReq.setContext({
          __SERVERSIDE_PROPS__: props || null
        });

        if (page)
          manager.bunextReq.setResponse(page || "", {
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
      }
    },
  },
  serverStart: {
    main() {
      new StaticPageCache().clearStaticPage();
    },
  },
} as BunextPlugin;


async function createPageIfNotExist(manager: RequestManager) {
  if (!manager.serverSide?.pathname) return;

  const cache = StaticPageCache.getInstance();
  if (cache.exists(manager.serverSide?.pathname)) return;
  await MakeStaticPage(manager);
}

async function setServerSidePropsContext(manager: RequestManager) {
  if (!manager.request.headers.get("Accept")?.includes("application/vnd.server-side-props")) return;
  await createPageIfNotExist(manager);
  const props = await GetServerSideProps(StaticPageCache.getInstance(), manager);
  manager.bunextReq.setContext({
    __SERVERSIDE_PROPS__: props || null
  });
  return props;
}