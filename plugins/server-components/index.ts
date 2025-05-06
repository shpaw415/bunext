import { generateRandomString } from "../../features/utils";
import type { BunextPlugin } from "../types";

/*

function isUseClient(fileData: string) {
    const line = fileData
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .at(0);
    if (!line) return false;
    if (line.startsWith("'use client'") || line.startsWith('"use client"'))
      return true;
    return false;
  }


export default {
    serverStart: {
        main(){

        }
    }
    build: {
        plugin: {
            name: "server-component",
            setup(build) {
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
                
                            if (isUseClient(fileContent))
                              return {
                                contents: await self.ClientSideFeatures(
                                  fileContent,
                                  path,
                                  _module_
                                ),
                                loader: "js",
                              };
                
                            const serverComponents = await self.ServerComponentsToTag(
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
                
                            const serverActionsTags = await self.ServerActionToTag(_module_);
                
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
                            fileContent = await self.ServerSideFeatures({
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
            },
        }
    },
    
} as BunextPlugin;

*/
