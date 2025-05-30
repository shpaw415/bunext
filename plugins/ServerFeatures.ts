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

/**
 * Determines whether the provided value is a function.
 *
 * @param functionToCheck - The value to check.
 * @returns `true` if the value is a function; otherwise, `false`.
 */
function isFunction(functionToCheck: any) {
  return typeof functionToCheck == "function";
}

type AnyFn = (...args: unknown[]) => unknown;
/**
 * Generates a client-side async function string that, when called, triggers a server action request for the specified server function.
 *
 * The returned function serializes its arguments and invokes a global server action handler with a unique identifier based on the module path and function name.
 *
 * @param func - The server action function to be exposed to the client.
 * @param ModulePath - The absolute path to the module containing the server action.
 * @returns A string representing an async client-side function that calls the corresponding server action on the server.
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

/**
 * Replaces server component placeholder tags in the file content with corresponding React element functions.
 *
 * @param serverComponents - An object mapping component names to their placeholder tags and React element strings.
 * @param fileContent - The source file content containing server component placeholders.
 * @returns The file content with server component placeholders replaced by React element functions.
 */
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
/**
 * Replaces server action placeholders in the file content with client-callable function strings.
 *
 * For each exported async server action in the module, finds its corresponding placeholder tag in {@link fileContent} and replaces it with a client-side function that triggers the server action via a remote call.
 *
 * @param _module - The module containing exported server actions.
 * @param fileContent - The source file content with server action placeholders.
 * @param modulePath - The path to the module, used for generating client stubs.
 * @returns The file content with server action placeholders replaced by client-callable function strings.
 */
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

/**
 * Maps exported server component functions in a module to their corresponding SSR element tags and React element strings.
 *
 * For each exported function in the module that qualifies as a server component (i.e., is a function, does not start with "Server", is not "getServerSideProps", and takes no parameters), finds the matching SSR element from the cache and returns an object mapping function names to their tag and React element string.
 *
 * @param modulePath - The path to the module containing server components.
 * @param _module - The module's exports.
 * @returns An object mapping export names to their SSR tag and React element string.
 */
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
 * Generates a mapping of server action export names to unique placeholder tags for transpiler replacement.
 *
 * @param moduleContent - The module's exported members.
 * @returns An object mapping each server action export (names starting with "Server") to its corresponding placeholder tag.
 */
async function ServerActionToTag(moduleContent: Record<string, unknown>) {
  return Object.fromEntries(
    Object.keys(moduleContent)
      .filter((ex) => ex.startsWith("Server"))
      .map((ex) => [ex, `<!BUNEXT_ServerAction_${ex}!>`])
  );
}

/**
 * Transforms file content by replacing server action exports with client-callable stubs for client-side usage.
 *
 * Applies Bun's transpiler to substitute server action exports with placeholder tags, then compiles these into client-side async functions that invoke server actions remotely.
 *
 * @param fileContent - The source code to transform.
 * @param filePath - The path of the file being processed.
 * @param module - The module object containing server action exports.
 * @returns The transformed file content with server actions replaced by client-callable functions.
 */
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

/**
 * Applies server-side transformations to file content by compiling server actions and server components.
 *
 * Replaces server action exports with client-callable stubs and substitutes server component placeholders with their corresponding React element renderers.
 *
 * @param modulePath - The path to the module being processed.
 * @param fileContent - The source code content to transform.
 * @param serverComponents - Mapping of server component names to their placeholder tags and React element renderers.
 * @param module - The imported module object containing exports.
 * @returns The transformed file content with server-side features applied.
 */
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

/**
 * Extracts and decodes server action parameters from a FormData object.
 *
 * Converts the "props" field from the FormData into an array of arguments, replacing special string markers with corresponding File objects, arrays of files, or the entire FormData as needed.
 *
 * @param data - The FormData containing encoded server action parameters.
 * @returns An array of decoded parameters, with files and FormData objects restored.
 *
 * @throws {Error} If the "props" field cannot be decoded as a URI component.
 */
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

/**
 * Handles a server action request by invoking the specified server action function with extracted parameters and returning the result as a Response.
 *
 * Extracts the target module and function from the request headers, deserializes parameters from the request body, executes the server action, and serializes the result as JSON, Blob, or File in the response. Sets appropriate headers and cookies on the response.
 *
 * @param manager - The request manager containing request headers, data, and context.
 * @returns A Response containing the result of the server action, with headers indicating the data type.
 *
 * @throws {Error} If the request is missing server action metadata, the target module is not found, or the specified function does not exist.
 */
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
/**
 * Parses the `serveractionid` header value to extract the module path and function call name.
 *
 * @param header - An object representing HTTP headers.
 * @returns An object with `path` and `call` properties if the header is present and valid; otherwise, `null`.
 */
function extractServerActionHeader(header: Record<string, string>) {
  if (!header.serveractionid) return null;
  const serverActionData = header.serveractionid.split(":");

  if (!serverActionData) return null;
  return {
    path: serverActionData[0],
    call: serverActionData[1],
  };
}

/**
 * Determines whether the current request matches a server-side rendered default export path.
 *
 * @param andProduction - If true, only returns true in production environment.
 * @returns True if the request is for a default SSR route (and, if specified, in production); otherwise, false.
 */
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

/**
 * Creates an error indicating that no server-side script was found for the given request path.
 *
 * @returns An {@link Error} with a message specifying the missing server-side script for the request path.
 */
function ErrorOnNoServerSideMatch(manager: RequestManager) {
  return new Error(`no serverSideScript found for ${manager.pathname}`);
}

/**
 * Wraps an HTML string in a React `<div>` element with a specific ID and sets its inner HTML.
 *
 * @param html - The HTML string to be injected.
 * @returns A React element containing the provided HTML.
 *
 * @remark The returned `<div>` uses `dangerouslySetInnerHTML` and has the ID `BUNEXT_INNER_PAGE_INSERTER`.
 */
function HTMLJSXWrapper(html: string) {
  return createElement("div", {
    id: "BUNEXT_INNER_PAGE_INSERTER",
    dangerouslySetInnerHTML: { __html: html },
  });
}

/**
 * Retrieves and wraps the pre-rendered SSR page for the given request.
 *
 * Imports the server-side module, locates the corresponding pre-built SSR element from cache, wraps it in a JSX container, and applies any stacked layouts defined for the route.
 *
 * @param manager - The request manager containing server-side rendering context.
 * @returns A React element representing the fully wrapped pre-rendered page, or `null` if no pre-built page is found.
 *
 * @throws {Error} If the request does not match a server-side route.
 */
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

/**
 * Generates and caches the server-side rendered (SSR) default page HTML for the given request.
 *
 * If a cached SSR default page exists for the request path, it is returned immediately. Otherwise, the function renders the page with all layouts, shells it, stringifies the result, caches it, and returns the HTML string. Returns `null` if the request does not match an SSR default export path or if rendering fails.
 *
 * @param manager - The request manager containing routing and rendering context.
 * @returns The SSR default page as an HTML string, or `null` if not applicable.
 */
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
        if (!req.request.headers.get("Accept")?.includes("text/html")) return;
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
