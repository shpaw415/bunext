"server only";

import type { DBSchema } from "database/schema";
import { CacheManagerPool } from "internal/caching";
import type { ServerSideProps, staticPage } from "internal/types";
import { join } from "node:path";
import type { BunextPlugin } from "../types";
import { router, type RequestManager } from "../../internal/server/router";
import { renderToString } from "react-dom/server";
import type { Table } from "public/database/class";
import { serverSidePropsManager } from "plugins/server-features/serverSideProps";

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
        nullable: true,
      },
      {
        name: "created_at",
        type: "Date",
      },
      {
        name: "etag",
        type: "string",
      },
    ],
  },
];

type StaticPageCacheType = staticPage & { created_at: Date; etag: string };


class StaticPageCache {

  private poolManager!: CacheManagerPool;

  async initialize() {
    this.poolManager = await CacheManagerPool.create({
      schema: staticPageCacheShema,
      dbPath: join(import.meta.dirname, "static_page.sqlite"),
    });
  }

  static async create() {
    const instance = new StaticPageCache();
    await instance.initialize();
    return instance;
  }

  async static_page<T>(then: (table: Table<StaticPageCacheType, StaticPageCacheType>) => T | Promise<T>): Promise<T> {
    return await this.poolManager.getTable<StaticPageCacheType, StaticPageCacheType>("static_page", then) as T;
  }

  async addStaticPage(pathname: string, page?: string, etag?: string) {
    const pageEtag = etag || this.generateETag(page || "");
    return await this.static_page((table) => table.upsert([
      {
        pathname,
        page,
        created_at: new Date(),
        etag: pageEtag,
      },
    ], ["pathname"]));
  }

  private generateETag(page: string): string {
    return `"${Bun.hash(page).toString(16)}"`;
  }
  async updateHTML(pathname: string, HTML: string) {
    return this.static_page((table) => table.update({
      where: {
        pathname
      },
      values: {
        page: HTML,
        etag: this.generateETag(HTML)
      }
    }));
  }
  async getStaticPage(pathname: string) {
    return (this.static_page((table) => table
      .select({
        where: {
          pathname,
        },
        select: {
          page: true,
        },
      })
      .at(0) ?? undefined))
  }
  async removeStaticPage(pathname: string) {
    return await this.static_page((table) => table
      .delete({
        where: {
          pathname,
        },
      }));
  }
  async clearStaticPage() {
    return this.static_page((table) => table.databaseInstance.run("DELETE FROM static_page"));
  }
  async exists(pathname: string): Promise<boolean> {
    return this.static_page((table) => table.exists({
      where: {
        pathname,
      },
    }));
  }
}

export const StaticPageCacheInstance = await StaticPageCache.create();

export default {
  priority: 1,
  router: {
    async request(manager) {
      if (process.env.NODE_ENV == "development" || manager.bunextReq.isResponseSetted()) return;


      const isUseStatic = manager.serverSide?.filePath ? (await manager.router.fileDirectives?.pathIs("use-static", manager.serverSide?.filePath)) as boolean : false;
      if (!isUseStatic) return;

      if (isRequestGetServerSideProps(manager)) {
        return await handleGetServerSideProps(manager);
      } else if (!manager.bunextReq.isAskingHTML) return;
      else {
        await handleGetHTMLPage(manager);
      }

    },
    html_rewrite: {
      async after(context, manager, HTML) {
        if (
          !manager.bunextReq.isAskingHTML ||
          manager.serverSide && !(await manager.router.fileDirectives?.pathIs("use-static", manager.serverSide.filePath)
          )) return;
        await StaticPageCacheInstance.updateHTML(manager.pathname, HTML);
      },
    }
  },
  serverStart: {
    async main() {
      await StaticPageCacheInstance.clearStaticPage();
    },

  },
} as BunextPlugin;


/**
 * Make static page
 * @returns page string, props
 */
async function MakeStaticPage(manager: RequestManager, props: ServerSideProps) {
  if (!manager.serverSide)
    throw new Error(`no serverSide path found for ${manager.pathname}`);
  manager.bunextReq.session.prevent_session_init();

  const pageJSX = await manager.makeDynamicJSXPage({
    serverSideProps: props,
  });
  if (!pageJSX)
    throw Error(
      `Error Caching page JSX from path: ${manager.serverSide.pathname}`
    );
  const pageString = renderToString(await manager.WrapPageWithShell(pageJSX));

  return { page: pageString, props };
}

function isRequestGetServerSideProps(manager: RequestManager): boolean {
  return (manager.request.headers.get("Accept")?.includes("application/vnd.server-side-props") && (typeof manager.serverSide !== "undefined")) as boolean;
}


async function handleGetServerSideProps(manager: RequestManager) {
  await createHTMLIfNotExists(manager, await makeServerSidePropsIfNotExists(manager));
}

async function handleGetHTMLPage(manager: RequestManager) {
  const props = await makeServerSidePropsIfNotExists(manager);
  const page = await createHTMLIfNotExists(manager, props);
  manager.bunextReq.setResponse(page.page || "", {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}




async function makeServerSidePropsIfNotExists(manager: RequestManager) {

  let props = await serverSidePropsManager.getFromCache(manager);
  if (props) return props;
  props = await serverSidePropsManager.make(manager);
  serverSidePropsManager.addToCache(manager, props);
  return props as ServerSideProps;
}

/**
 * Create HTML if not exists then cache result
 * @returns pageData
 */
async function createHTMLIfNotExists(manager: RequestManager, props: ServerSideProps): Promise<Omit<staticPage, "pathname">> {
  const cache = StaticPageCacheInstance;
  const pathname = manager.pathname;
  const pageData = await cache.getStaticPage(pathname);
  if (!pageData?.page) {
    const page = (await MakeStaticPage(manager, props));
    await cache.addStaticPage(pathname, page.page);
    return page;
  }
  return pageData;
}

const noRouteThrow = (route: string) =>
  new Error(`route ${route} does not exists`);



let timers = new Map<string, NodeJS.Timeout>();



/**
 * revalidate the specific path like: /some/path/id_1
 * @param pathname pathLike of the route you want to revalidate
 * @param timeout timeout in seconds
 * @example
 * // Revalidate the static page for the user wall after 60 seconds
 * revalidateStatic("/user/wall/johnDoe", 60);
 */
export function revalidateStatic<TimeOut extends number | undefined = undefined>(pathlike: Request | string, timeout?: TimeOut): TimeOut extends number ? void : Promise<void> {

  const _revalidate: () => Promise<void> = async () => {
    const manager = StaticPageCacheInstance;
    if (pathlike instanceof Request) {
      const match = router.server.match(pathlike);
      if (!match) throw noRouteThrow(pathlike.url);
      manager.removeStaticPage(match.pathname);
      serverSidePropsManager.removeFromCacheByPathname(match.pathname);
    } else {
      manager.removeStaticPage(pathlike);
      serverSidePropsManager.removeFromCacheByPathname(pathlike);
    }
  };

  if (typeof timeout == "undefined") {
    return _revalidate() as any;
  } else {
    clearTimeout(timers.get(pathlike instanceof Request ? pathlike.url : pathlike));
    timers.set(pathlike instanceof Request ? pathlike.url : pathlike, setTimeout(_revalidate, timeout * 1000));
    return undefined as any;
  }
}