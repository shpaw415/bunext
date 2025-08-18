"server only";

import type { DBSchema } from "../../database/schema";
import { CacheManagerExtends } from "../../internal/caching";
import type { getServerSidePropsFunction, ServerSideProps, staticPage } from "../../internal/types";
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


export class StaticPageCache extends CacheManagerExtends {
  private static_page = this.CreateTable<StaticPageCacheType, StaticPageCacheType>("static_page");

  constructor() {
    super({
      shema: staticPageCacheShema,
      dbPath: join(import.meta.dirname, "static_page.sqlite"),
    });
  }

  static getInstance(): StaticPageCache {
    return new StaticPageCache();
  }

  addStaticPage(pathname: string, page?: string, raw_props?: {}, etag?: string) {
    const pageEtag = etag || this.generateETag(page || "", raw_props);
    this.static_page.upsert([
      {
        pathname,
        page,
        props: raw_props,
        created_at: new Date(),
        etag: pageEtag,
      },
    ], ["pathname"]);
  }

  addStaticPageProps(pathname: string, props: staticPage["props"]) {
    this.static_page.upsert([{
      pathname,
      props,
      etag: this.generateETag("", props),
      created_at: new Date(),
    }], ["pathname"]);
  }

  private generateETag(page: string, props?: Object): string {
    const content = page + (props ? JSON.stringify(props) : '');
    return `"${Bun.hash(content).toString(16)}"`;
  }
  updateHTML(pathname: string, HTML: string) {
    this.static_page.update({
      where: {
        pathname
      },
      values: {
        page: HTML,
        etag: this.generateETag(HTML)
      }
    });
  }
  getStaticPage(pathname: string) {
    return (this.static_page
      .select({
        where: {
          pathname,
        },
        select: {
          page: true,
          props: true,
        },
      })
      .at(0) ?? undefined)
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
      after(context, manager, HTML) {
        if (!manager.bunextReq.isAskingHTML || !manager.router.fileDirectives?.getDirectiveFromRoute(manager.pathname)) return;
        new StaticPageCache().updateHTML(manager.pathname, HTML);
      },
    }
  },
  serverStart: {
    main() {
      new StaticPageCache().clearStaticPage();
    },

  },
} as BunextPlugin;


async function makeServerSidePropsIfNotExists(manager: RequestManager) {
  const cache = StaticPageCache.getInstance();
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
  const cache = StaticPageCache.getInstance();
  const pathname = manager.pathname;
  const pageData = cache.getStaticPage(pathname);
  if (!pageData?.page) {
    const page = (await MakeStaticPage(manager, props)) as staticPage;
    cache.addStaticPage(pathname, page.page, props);
    return page;
  }
  return pageData;
}
