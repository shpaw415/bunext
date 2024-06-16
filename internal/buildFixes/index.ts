import type { BuildOutput, BunPlugin } from "bun";
import "../server_global";
import type { Builder } from "../build";

export type afterBuildCallback = ({
  buildPath,
  tmpPath,
  outputs,
  builder,
}: {
  buildPath: string;
  tmpPath: string;
  outputs: BuildOutput;
  builder: Builder;
}) => void | Promise<void>;

export class BuildFix {
  plugin?: BunPlugin;
  afterBuildCallback?: afterBuildCallback;
  constructor({
    plugin,
    afterBuild,
  }: {
    plugin?: BunPlugin;
    afterBuild?: afterBuildCallback;
  }) {
    this.plugin = plugin;
    this.afterBuildCallback = afterBuild;
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

export async function GetBuildFixFiles() {
  return (
    await Array.fromAsync(
      new Bun.Glob("*.ts").scan({
        cwd: import.meta.dirname,
        onlyFiles: true,
        absolute: true,
      })
    )
  ).filter((e) => !e.endsWith("index.ts"));
}
