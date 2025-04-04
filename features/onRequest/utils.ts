import { extname, join, normalize, resolve } from "path";
import { type BuildConfig, type BunFile } from "bun";
import { relative } from "path";
import { router } from "../../internal/router.tsx";

const cwd = process.cwd();

export const entrypoints = [
  "react",
  "react-dom",
  "scheduler",
  "react-dom/client",
  "react/jsx-dev-runtime",
];

/**
 *
 * @param param - The path to the dir to serve
 * @returns
 */
export async function serveFrom({
  directory,
  request,
  buildOptions,
}: {
  directory: string;
  request: Request;

  buildOptions?: BuildConfig;
}) {
  directory = resolve(directory);
  const relativeDirectoryPath = relative(cwd, directory);

  let pathname = new URL(request.url).pathname;

  if (pathname.includes("chunk-") && pathname.split("/").length > 3) {
    const glob = Array.from(
      new Bun.Glob("**.js").scanSync({
        absolute: true,
        cwd: normalize(join(router.buildDir, relativeDirectoryPath)),
        onlyFiles: true,
      })
    );
    const fileName = pathname.split("/").pop();
    const filePath = glob.find((file) => file.endsWith(fileName as string));
    if (filePath) {
      const file = Bun.file(filePath);
      return MakeTextRes(file);
    }
  }

  if (!pathname.startsWith(join("/", relativeDirectoryPath))) return null;
  pathname = normalize(pathname.replace(relativeDirectoryPath, ""));

  const file = await serveFromDir({
    directory,
    path: pathname,
    suffixes: [
      "",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".css",
      ".json",
      ".xml",
      ".csv",
      ".html",
    ],
  });

  if (!file || !(await file.exists()) || !file.name) return null;

  const ext = extname(file.name as string).replace(".", "");
  const relativeFilePath = relative(cwd, file.name);

  const buildFile = (path: string) =>
    Bun.build({
      outdir: normalize(join(router.buildDir, relativeDirectoryPath)),
      root: router.buildDir,
      splitting: true,
      minify: process.env.NODE_ENV == "production",
      ...buildOptions,
      entrypoints: [path, ...(buildOptions?.entrypoints ?? entrypoints)],
      external: ["bun"],
    });

  const getBuildedFile = (ext: "css" | "js") => {
    const formatedFileName = relativeFilePath.split(".") as Array<string>;
    formatedFileName.pop();
    formatedFileName.push(ext);
    return Bun.file(
      normalize(join(router.buildDir, `${formatedFileName.join(".")}`))
    );
  };

  switch (ext) {
    case "csv":
    case "html":
    case "xml":
    case "json":
      return MakeTextRes(file);
    case "ts":
    case "tsx":
    case "jsx":
    case "js":
    case "css":
      const formatedExt = ext == "css" ? "css" : "js";
      const buildedFile = getBuildedFile(formatedExt);
      if (process.env.NODE_ENV == "production" && (await buildedFile.exists()))
        return MakeTextRes(buildedFile);
      const res = await buildFile(file.name as string);
      if (res.success) {
        return MakeTextRes(getBuildedFile(formatedExt));
      }
      return null;
    default:
      return null;
  }
}

async function serveFromDir(config: {
  directory: string;
  path: string;
  suffixes?: string[];
}) {
  const basePath = join(config.directory, normalize(decodeURI(config.path)));
  const suffixes = config.suffixes ?? [
    "",
    ".html",
    "index.html",
    ".js",
    "/index.js",
    ".css",
  ];
  for await (const suffix of suffixes) {
    const pathWithSuffix = basePath + suffix;
    let file = Bun.file(pathWithSuffix);
    if (await file.exists()) return file;
  }

  return null;
}

function MakeTextRes(content: BunFile | string, mimeType?: string) {
  if (content instanceof Blob) {
    return new Response(content);
  } else {
    return new Response(content, {
      headers: {
        "Content-Type": `text/${mimeType}`,
      },
    });
  }
}
