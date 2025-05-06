import { generateRandomString } from "../../features/utils";
import { builder } from "../../internal/server/build";
import { type BunextPlugin } from "../types";
import { normalize } from "path";

async function ServerActionToTag(moduleContent: Record<string, unknown>) {
  return Object.entries(moduleContent)
    .filter(([ex, _]) => ex.startsWith("Server"))
    .reduce(
      (a, [ex, _]) => ({
        ...a,
        [ex]: `<!BUNEXT_ServerAction_${ex}!>`,
      }),
      {}
    ) as { [key: string]: string };
}

function ServerActionToClient(func: Function, ModulePath: string): string {
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
    const SAFunc = _module[serverAction] as Function;
    const SAString = SAFunc.toString();
    if (!SAString.startsWith("async")) continue;
    fileContent = fileContent.replace(
      `"<!BUNEXT_ServerAction_${serverAction}!>"`,
      ServerActionToClient(SAFunc, modulePath)
    );
  }

  return fileContent;
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

export default {
  build: {
    plugin: {
      name: "serverAction",
      target: "browser",
      setup(build) {
        build.onLoad(
          { namespace: "client", filter: /\.tsx$/ },
          async ({ path }) => {
            const contents = await ClientSideFeatures(
              await Bun.file(path).text(),
              path,
              await import(
                process.env.NODE_ENV == "production"
                  ? path
                  : path + `?${generateRandomString(5)}`
              )
            );
            return {
              contents,
              loader: "js",
            };
          }
        );
      },
    },
  },
} as BunextPlugin;
