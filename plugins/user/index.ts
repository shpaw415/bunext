import type { AfterBuildMain } from "../after_build_main/types";
import type { BeforeBuild } from "../before_build_main/types";
import type { Build_Plugins } from "../build/types";
import type { HTML_Rewrite_plugin_function } from "../router/html_rewrite/types";
import type { Request_Plugin } from "../router/request/types";
import type { ServerStart } from "../server-start/types";

export type BunextPlugin = Partial<{
  after_build: (BuildArtifact: Bun.BuildArtifact) => Promise<any> | any;
  after_build_main: AfterBuildMain;
  before_build_main: BeforeBuild;
  build: Build_Plugins;
  router: {
    html_rewrite: HTML_Rewrite_plugin_function;
    request: Request_Plugin;
  };
  serverStart: ServerStart;
}>;
