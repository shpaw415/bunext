"server only";

import type { DBSchema } from "../../database/schema";
import { CacheManagerPool } from "../../internal/caching";
import type { getServerSidePropsFunction, ServerSideProps, staticPage } from "../../internal/types";
import { join } from "node:path";
import type { BunextPlugin } from "../types";
import { router, type RequestManager } from "../../internal/server/router";
import { renderToString } from "react-dom/server";
import type { Table } from "public/database/class";

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
        name: "props",
        type: "json",
        nullable: true,
        DataType: {},
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


class StaticPageCache extends CacheManagerPool {

  constructor() {
    super({
      schema: staticPageCacheShema,
      dbPath: join(import.meta.dirname, "static_page.sqlite"),
    });
  }

  async static_page<T>(then: (table: Table<StaticPageCacheType, StaticPageCacheType>) => T | Promise<T>): Promise<T> {
    return await this.getTable<StaticPageCacheType, StaticPageCacheType>("static_page", then) as T;
  }

  async addStaticPage(pathname: string, page?: string, raw_props?: {}, etag?: string) {
    const pageEtag = etag || this.generateETag(page || "", raw_props);
    return await this.static_page((table) => table.upsert([
      {
        pathname,
        page,
        props: raw_props,
        created_at: new Date(),
        etag: pageEtag,
      },
    ], ["pathname"]));
  }

  async addStaticPageProps(pathname: string, props: staticPage["props"]) {
    return this.static_page((table) => table.upsert([{
      pathname,
      props,
      etag: this.generateETag("", props),
      created_at: new Date(),
    }], ["pathname"]));
  }

  private generateETag(page: string, props?: Object): string {
    const content = page + (props ? JSON.stringify(props) : '');
    return `"${Bun.hash(content).toString(16)}"`;
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
          props: true,
        },
      })
      .at(0) ?? undefined))
  }
  async getStaticPageProps(pathname: string) {
    return this.static_page((table) => table
      .select({
        where: {
          pathname,
        },
        select: {
          props: true,
        },
      })
      .at(0)?.props ?? undefined as staticPage | undefined
    );

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

export const StaticPageCacheInstance = new StaticPageCache();

/**
 * Make static page
 * @returns page string, props
 */
async function MakeStaticPage(manager: RequestManager, props: staticPage["props"]) {
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

function serveGetServerSideProps(manager: RequestManager, props: staticPage["props"]): void {
  manager.bunextReq
    .preventGlobalValuesInjection()
    .preventRewrite()
    .setResponse(props === undefined ? "" : JSON.stringify(props), {
      headers: {
        "Content-Type": "application/vnd.server-side-props",
      },
    });
}

async function handleGetServerSideProps(manager: RequestManager) {
  const props = await makeServerSidePropsIfNotExists(manager);
  createHTMLIfNotExists(manager, props);
  serveGetServerSideProps(manager, props);
}

async function handleGetHTMLPage(manager: RequestManager) {
  const props = await makeServerSidePropsIfNotExists(manager);
  const page = await createHTMLIfNotExists(manager, props);
  manager.bunextReq.InjectGlobalValues({
    __SERVERSIDE_PROPS__: props
  })
  manager.bunextReq.setResponse(page.page || "", {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export default {
  priority: 0,
  router: {
    async request(manager) {
      if (process.env.NODE_ENV == "development" || manager.bunextReq.isResponseSetted()) return;

      const isUseStatic = manager.router.fileDirectives?.getDirectiveFromRoute(manager.pathname);
      if (isRequestGetServerSideProps(manager) && isUseStatic) {
        return await handleGetServerSideProps(manager);
      } else if (!manager.bunextReq.isAskingHTML || !isUseStatic) return;
      else await handleGetHTMLPage(manager);

    },
    html_rewrite: {
      async after(context, manager, HTML) {
        if (!manager.bunextReq.isAskingHTML || !manager.router.fileDirectives?.getDirectiveFromRoute(manager.pathname)) return;
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


async function makeServerSidePropsIfNotExists(manager: RequestManager) {
  const cache = StaticPageCacheInstance;
  const props = cache.getStaticPageProps(manager.pathname);
  if (props) return props;

  const _props = await makeServerSideProps(manager);
  cache.addStaticPageProps(manager.pathname, _props);
  return _props;
}

async function makeServerSideProps<T extends Record<string, unknown> = {}>(manager: RequestManager): Promise<undefined | ServerSideProps<T>> {
  if (!manager.serverSide) throw new Error(`no serverSide found for pathname: ${manager.pathname}`);
  manager.bunextReq.session.prevent_session_init();
  const module = (await import(manager.serverSide.filePath)) as { getServerSideProps?: getServerSidePropsFunction };
  if (!module?.getServerSideProps) {
    return undefined;
  }
  return (await module.getServerSideProps({ params: manager.serverSide.params, request: manager.request }, manager.bunextReq)) as ServerSideProps<T>;
}
/**
 * Create HTML if not exists then cache result
 * @returns pageData
 */
async function createHTMLIfNotExists(manager: RequestManager, props: staticPage["props"]): Promise<Omit<staticPage, "pathname">> {
  const cache = StaticPageCacheInstance;
  const pathname = manager.pathname;
  const pageData = await cache.getStaticPage(pathname);
  if (!pageData || !pageData) {
    const page = (await MakeStaticPage(manager, props)) as staticPage;
    cache.addStaticPage(pathname, page.page, props);
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
 */
export function revalidateStatic<TimeOut extends number | undefined = undefined>(pathlike: Request | string, timeout?: TimeOut): TimeOut extends number ? void : Promise<void> {

  const _revalidate: () => Promise<void> = async () => {
    const manager = StaticPageCacheInstance;
    if (pathlike instanceof Request) {
      const match = router.server.match(pathlike);
      if (!match) throw noRouteThrow(pathlike.url);
      manager.removeStaticPage(match.pathname);
    } else {
      manager.removeStaticPage(pathlike);
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