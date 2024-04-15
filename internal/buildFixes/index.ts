import type { BunPlugin } from "bun";
import "../server_global";

export type afterBuildCallback = ({
  buildPath,
  tmpPath,
}: {
  buildPath: string;
  tmpPath: string;
}) => void | Promise<void>;
export class BuildFix {
  plugin?: BunPlugin;
  afterBuildCallback?: afterBuildCallback;
  depName: string;
  constructor({
    dependencyName,
    plugin,
    afterBuild,
  }: {
    dependencyName: string;
    plugin?: BunPlugin;
    afterBuild?: afterBuildCallback;
  }) {
    this.depName = dependencyName;
    this.plugin = plugin;
    this.afterBuildCallback = afterBuild;
  }
  async hasDependency() {
    const packageJson = JSON.parse(
      await Bun.file(process.cwd() + "/package.json").text()
    ) as {
      dependencies?: Record<string, string>;
    };
    if (!packageJson.dependencies) return false;
    if (packageJson.dependencies[this.depName]) return true;
    return false;
  }
  static convertImportsToBrowser(fileContent: string) {
    const { imports } = new Bun.Transpiler({ loader: "js" }).scan(fileContent);
    for (const path of imports
      .map((e) => e.path)
      .filter((e) => !e.startsWith(".") && !e.startsWith("/"))) {
      if (fileContent.includes(`'${path}'`))
        fileContent = fileContent.replace(`from '${path}'`, `from "/${path}"`);
      else if (fileContent.includes(`"${path}"`))
        fileContent = fileContent.replace(`from "${path}"`, `from "/${path}"`);
    }
    return fileContent;
  }
}
