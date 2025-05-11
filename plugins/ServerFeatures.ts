import CacheManager from "../internal/caching";
import type { BunextPlugin } from "./types";
import { builder } from "../internal/server/build";
import { normalize, basename, join } from "path";
import { generateRandomString } from "../features/utils";
import { RequestManager } from "../internal/server/router";
import type {
  ServerActionDataType,
  ServerActionDataTypeHeader,
} from "../internal/types";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

const cwd = process.cwd();

function isFunction(functionToCheck: any) {
  return typeof functionToCheck == "function";
}

type AnyFn = (...args: unknown[]) => unknown;
/**
 * this will set this.ssrElements & this.revalidates and make the build out from
 * a child process to avoid some error while building multiple time from the main process.
 */
function ServerActionToClient(func: AnyFn, ModulePath: string): string {
  const path = ModulePath.split(builder.options.pageDir as string).at(
    1
  ) as string;

  const ServerActionClient = (ModulePath: string, funcName: string) => {
    return async function (...props: Array<any>) {
      return await globalThis.MakeServerActionRequest(props, "TARGET");
    }
      .toString()
      .replace("async function", "")
      .replace("TARGET", ModulePath + ":" + funcName);
  };

  return `async function ${func.name}${ServerActionClient(
    normalize(path),
    func.name
  )}`;
}

function ServerComponentsCompiler(
  serverComponents: {
    [key: string]: {
      tag: string; // "<!Bunext_Element_FunctionName!>"
      reactElement: string;
    };
  },
  fileContent: string
) {
  for (const _component of Object.keys(serverComponents)) {
    const component = serverComponents[_component] as {
      tag: string;
      reactElement: string;
    };

    fileContent = fileContent.replace(
      `"${component.tag}"`,
      `() => (${component.reactElement});`
    );
  }

  return fileContent;
}
function ServerActionCompiler(
  _module: Record<string, unknown>,
  fileContent: string,
  modulePath: string
) {
  const ServerActionsExports = Object.keys(_module).filter(
    (k) =>
      k.startsWith("Server") ||
      (k == "default" &&
        typeof _module[k] == "function" &&
        _module[k].name.startsWith("Server"))
  );
  // ServerAction
  for (const serverAction of ServerActionsExports) {
    const SAFunc = _module[serverAction] as AnyFn;
    const SAString = SAFunc.toString();
    if (!SAString.startsWith("async")) continue;
    fileContent = fileContent.replace(
      `"<!BUNEXT_ServerAction_${serverAction}!>"`,
      ServerActionToClient(SAFunc, modulePath)
    );
  }

  return fileContent;
}

async function ServerComponentsToTag(
  modulePath: string,
  _module: Record<string, unknown>
) {
  // ServerComponent
  const ssrModule = CacheManager.getSSR(modulePath);
  const defaultName = (_module?.default as Function)?.name;
  let replaceServerElement: {
    [key: string]: {
      tag: string;
      reactElement: string;
    };
  } = {};
  for await (const exported of Object.keys(_module)) {
    const Func = _module[exported] as Function;

    if (
      !isFunction(Func) ||
      Func.name.startsWith("Server") ||
      Func.name == "getServerSideProps" ||
      Func.length > 0
    ) {
      continue;
    }

    const ssrElement = ssrModule?.elements.find(
      (e) => e.tag == `<!Bunext_Element_${Func.name}!>`
    );

    if (!ssrElement) continue;
    if (defaultName == Func.name) replaceServerElement.default = ssrElement;
    else replaceServerElement[Func.name] = ssrElement;
  }
  return replaceServerElement;
}

/**
 * used for transform serverAction to tag for Transpiler
 */
async function ServerActionToTag(moduleContent: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(moduleContent)
      .filter((ex) => ex.startsWith("Server"))
      .map((ex) => [ex, `<!BUNEXT_ServerAction_${ex}!>`])
  );
}

async function ClientSideFeatures(
  fileContent: string,
  filePath: string,
  module: Record<string, unknown>
) {
  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    deadCodeElimination: true,
    jsxOptimizationInline: true,
    exports: {
      replace: {
        ...(await ServerActionToTag(module)),
      },
    },
  });

  return ServerActionCompiler(
    module,
    transpiler.transformSync(fileContent),
    filePath
  );
}

async function ServerSideFeatures({
  modulePath,
  fileContent,
  serverComponents,
  module,
}: {
  modulePath: string;
  fileContent: string;
  serverComponents: {
    [key: string]: {
      tag: string; // "<!Bunext_Element_FunctionName!>"
      reactElement: string;
    };
  };
  module: Record<string, unknown>;
}) {
  fileContent = ServerActionCompiler(module, fileContent, modulePath);
  fileContent = ServerComponentsCompiler(serverComponents, fileContent);

  return fileContent;
}

function extractPostData(data: FormData) {
  let raw = data.get("props");
  if (typeof raw != "string") return [];
  try {
    raw = decodeURI(raw);
  } catch {
    throw new Error("Cannot decode server action payload");
  }

  return (JSON.parse(raw) as Array<unknown>).map((prop) => {
    if (typeof prop == "string" && prop.startsWith("BUNEXT_FILE_")) {
      return data.get(prop) as File;
    } else if (
      Array.isArray(prop) &&
      prop.length > 0 &&
      typeof prop[0] == "string" &&
      prop[0].startsWith("BUNEXT_BATCH_FILES_")
    ) {
      return data.getAll(prop[0]);
    } else if (typeof prop == "string" && prop == "BUNEXT_FORMDATA") {
      return data;
    } else return prop;
  });
}

async function serverActionGetter(manager: RequestManager): Promise<Response> {
  const reqData = extractServerActionHeader(manager.request_header);

  if (!reqData) throw new Error(`no request Data for ServerAction`);
  const props = extractPostData(manager.data);
  const module = manager.router.serverActions.find(
    (s) => s.path === reqData.path.slice(1)
  );
  if (!module)
    throw new Error(`no module found for ServerAction ${reqData.path}`);
  const call = module.actions.find((f) => f.name === reqData.call);
  if (!call)
    throw new Error(
      `no function founded for ServerAction ${reqData.path}/${reqData.call}`
    );
  const fillUndefinedParams = (
    Array.apply(null, Array(call.length)) as Array<null>
  ).map(() => undefined);
  let result: ServerActionDataType = await call(
    ...[...props, ...fillUndefinedParams, manager.bunextReq]
  );

  let dataType: ServerActionDataTypeHeader = "json";
  if (result instanceof Blob) {
    dataType = "blob";
  } else if (result instanceof File) {
    dataType = "file";
  } else {
    result = JSON.stringify({ props: result });
  }

  return manager.bunextReq.setCookie(
    new Response(result as Exclude<ServerActionDataType, object>, {
      headers: {
        ...manager.bunextReq.response.headers,
        dataType,
        fileData:
          result instanceof File
            ? JSON.stringify({
                name: result.name,
                lastModified: result.lastModified,
              })
            : undefined,
      },
    })
  );
}
function extractServerActionHeader(header: Record<string, string>) {
  if (!header.serveractionid) return null;
  const serverActionData = header.serveractionid.split(":");

  if (!serverActionData) return null;
  return {
    path: serverActionData[0],
    call: serverActionData[1],
  };
}

function isSSRDefaultExportPath(
  manager: RequestManager,
  andProduction?: boolean
) {
  if (andProduction && process.env.NODE_ENV != "production") return false;
  return Boolean(
    manager.serverSide &&
      manager.router.ssrAsDefaultRoutes.includes(manager.serverSide?.name)
  );
}

function ErrorOnNoServerSideMatch(manager: RequestManager) {
  return new Error(`no serverSideScript found for ${manager.pathname}`);
}

function HTMLJSXWrapper(html: string) {
  return createElement("div", {
    id: "BUNEXT_INNER_PAGE_INSERTER",
    dangerouslySetInnerHTML: { __html: html },
  });
}

async function getPreRenderedPage(manager: RequestManager) {
  if (!manager.serverSide) throw ErrorOnNoServerSideMatch(manager);
  const module = await import(manager.serverSide.filePath);
  const preBuiledPage = CacheManager.getSSR(
    manager.serverSide.filePath
  )?.elements.find((e) =>
    e.tag.endsWith(`${module.default.name}!>`)
  )?.htmlElement;

  if (!preBuiledPage) return null;

  return await manager.router.stackLayouts(
    manager.serverSide,
    HTMLJSXWrapper(preBuiledPage)
  );
}

async function getSSRDefaultPage(manager: RequestManager) {
  if (!isSSRDefaultExportPath(manager, true) || !manager.serverSide)
    return null;
  const cache = CacheManager.getSSRDefaultPage(manager.serverSide.pathname);
  if (cache) return cache;

  const preRenderedPage = await getPreRenderedPage(manager);
  if (!preRenderedPage) return null;

  const PageWithLayouts = await manager.router.stackLayouts(
    manager.serverSide,
    preRenderedPage
  );

  const shelledPage = await manager.makePage(PageWithLayouts);
  if (!shelledPage) return null;
  const stringifiedShelledPage = await manager.formatPage(
    renderToString(shelledPage)
  );

  CacheManager.addSSRDefaultPage(
    manager.serverSide.pathname,
    stringifiedShelledPage
  );

  return stringifiedShelledPage;
}

export default {
  serverStart: {
    main() {
      CacheManager.clearSSR();
      CacheManager.clearSSRDefaultPage();
    },
  },
  router: {
    html_rewrite: {
      rewrite: (rewriter) => {
        rewriter.on("#BUNEXT_INNER_PAGE_INSERTER", {
          element(element) {
            element.removeAndKeepContent();
          },
        });
      },
    },
    async request(req, manager) {
      // server action
      if (manager.pathname == "/ServerActionGetter") {
        await req.session.initData();
        return req.__SET_RESPONSE__(await serverActionGetter(manager));
      }
      // SSR Page
      if (isSSRDefaultExportPath(manager, true)) {
        req.session.prevent_session_init();
        const stringPage = await getSSRDefaultPage(manager);
        if (stringPage) {
          return req.__SET_RESPONSE__(
            new Response(Buffer.from(Bun.gzipSync(stringPage)), {
              headers: {
                "content-type": "text/html; charset=utf-8",
                "Content-Encoding": "gzip",
              },
            })
          );
        }
      }
    },
  },
  build: {
    plugin: {
      name: "server-features",
      target: "browser",
      setup(build) {
        build.onLoad(
          {
            filter: new RegExp(
              "^" +
                builder.escapeRegExp(
                  normalize(
                    join(
                      builder.options.baseDir,
                      builder.options.pageDir as string
                    )
                  )
                ) +
                "/.*" +
                "\\.(ts|tsx|jsx)$"
            ),
          },
          async ({ path, loader, ...props }) => {
            const fileText = await Bun.file(path).text();
            const exports = new Bun.Transpiler({
              loader: loader as "tsx" | "ts",
              exports: {
                eliminate: ["getServerSideProps"],
              },
            }).scan(fileText).exports;

            return {
              contents: `export { ${exports.join(", ")} } from 
                    ${JSON.stringify("./" + basename(path) + "?client")}`,
              loader: "ts",
            };
          }
        );
        build.onResolve(
          { filter: /\.(ts|tsx)\?client$/ },
          async ({ importer, path }) => {
            const url = Bun.pathToFileURL(importer);
            const filePath = Bun.fileURLToPath(new URL(path, url));
            return {
              path: filePath,
              namespace: "client",
            };
          }
        );
        build.onLoad(
          { namespace: "client", filter: /\.tsx$/ },
          async ({ path }) => {
            let fileContent = await Bun.file(path).text();
            const _module_ = await import(
              process.env.NODE_ENV == "production"
                ? path
                : path + `?${generateRandomString(5)}`
            );
            if (
              ["layout.tsx"]
                .map((endsWith) => path.endsWith(endsWith))
                .filter((t) => t == true).length > 0
            ) {
              return {
                contents: fileContent,
                loader: "tsx",
              };
            }

            if (builder.isUseClient(fileContent))
              return {
                contents: await ClientSideFeatures(fileContent, path, _module_),
                loader: "js",
              };

            const serverComponents = await ServerComponentsToTag(
              path,
              _module_
            );

            const serverComponentsForTranspiler = Object.assign(
              {},
              ...[
                ...Object.keys(serverComponents).map((component) => ({
                  [component]: serverComponents[component].tag,
                })),
              ]
            ) as Record<string, string>;

            const serverActionsTags = await ServerActionToTag(_module_);

            const transpiler = new Bun.Transpiler({
              loader: "tsx",
              exports: {
                replace: {
                  ...serverActionsTags,
                  ...serverComponentsForTranspiler,
                },
              },
            });
            fileContent = transpiler.transformSync(fileContent);
            fileContent = await ServerSideFeatures({
              modulePath: path,
              fileContent: fileContent,
              serverComponents: serverComponents,
              module: _module_,
            });

            fileContent = new Bun.Transpiler({
              loader: "jsx",
              jsxOptimizationInline: true,
              trimUnusedImports: true,
              treeShaking: true,
            }).transformSync(fileContent);

            for (const name of Object.keys(serverComponents))
              fileContent = fileContent.replace(
                `function ${name}()`,
                `function _${name}()`
              );

            return {
              contents: fileContent,
              loader: "js",
            };
          }
        );
        build.onLoad(
          { namespace: "client", filter: /\.ts$/ },
          async ({ path }) => {
            return {
              contents: await ClientSideFeatures(
                await Bun.file(path).text(),
                path,
                await import(
                  process.env.NODE_ENV == "production"
                    ? path
                    : path + `?${generateRandomString(5)}`
                )
              ),
              loader: "js",
            };
          }
        );
        build.onLoad(
          {
            filter: new RegExp(
              "^" +
                builder.escapeRegExp(normalize(builder.options.baseDir)) +
                "/.*" +
                "\\.(ts|tsx|jsx)$"
            ),
          },
          async ({ path, loader }) => {
            const fileText = await Bun.file(path).text();
            const exports = new Bun.Transpiler({
              loader: loader as "tsx" | "ts",
            }).scan(fileText).exports;

            return {
              contents: `export { ${exports.join(", ")} } from 
                    ${JSON.stringify("./" + basename(path) + "?module")}`,
              loader: "ts",
            };
          }
        );
        build.onResolve(
          { filter: /\.(ts|tsx)\?module$/ },
          async ({ importer, path }) => {
            const url = Bun.pathToFileURL(importer);
            const filePath = Bun.fileURLToPath(new URL(path, url));
            return {
              path: filePath,
              namespace: "module",
            };
          }
        );
        build.onLoad(
          { filter: /\.(ts|tsx)$/, namespace: "module" },
          async ({ path, loader }) => {
            if (
              builder.remove_node_modules_files_path.includes(
                path.replace(builder.options.baseDir + "/node_modules/", "")
              ) ||
              builder.dev_remove_file_path.includes(path.replace(cwd + "/", ""))
            ) {
              return {
                contents: "",
                loader,
              };
            }

            return {
              contents: await Bun.file(path).text(),
              loader,
            };
          }
        );
      },
    },
  },
} as BunextPlugin;
