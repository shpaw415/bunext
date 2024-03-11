import { paths } from "../globals";
import { normalize } from "path";
import { Glob } from "bun";

declare global {
  var headInit: boolean;
}

globalThis.headInit ??= true;

export async function __setHead__() {
  const files = glob(paths.basePagePath);
  for await (const filePath of files) {
    const fileNoExt = filePath.split("/").at(-1)?.split(".")[0] as string;
    if (fileNoExt != "index" && !fileNoExt.match(/\[([^\]]+)\]/)) continue;
    const _filePath = normalize(
      "/" +
        filePath.split(paths.basePagePath)[1].split("/").slice(0, -1).join("/")
    );

    globalThis.currentPath = _filePath;
    try {
      await import(filePath);
    } catch (e) {
      console.log(e);
    }
  }
}

function glob(
  path: string,
  pattern = "**/*.{ts,tsx,js,jsx}"
): AsyncIterableIterator<string> {
  const glob = new Glob(pattern);
  return glob.scan({ cwd: path, onlyFiles: true, absolute: true });
}
