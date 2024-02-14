import { type MatchedRoute } from "bun";
import { _assetFileRouter, _fileRouter } from "./fileRouter";
import ReactDOMServer, {
  type ReactDOMServerReadableStream,
} from "react-dom/server";
import { App } from "./server-response";
import { webToken } from "@bunpmjs/json-webtoken";
import { basePagePath, bunextSharedPath } from "./globals";
import { readdirSync } from "fs";

interface _fileRouterStruct {
  default?: (route: MatchedRoute) => JSX.Element | Promise<JSX.Element>;
}

export function startServer() {
  try {
    globalThis.server = createServer();
    console.log(
      `Listening on ${globalThis.server.hostname}:${globalThis.server.port}`
    );
  } catch {}
}

const buildsMatchers = new Map<string, () => Response>();

async function createBuildFile(relativePathToIndex: string, url: string = "/") {
  const pagesDir = process.cwd() + "/src/pages";
  const indexPagePath = pagesDir + "/" + relativePathToIndex;
  const pageDefault = require(indexPagePath).default as
    | (() => JSX.Element)
    | undefined;
  if (!pageDefault)
    throw new Error(relativePathToIndex + " missing default export");
  const name = pageDefault.name;

  let hydrateBasicFile = await Bun.file(
    bunextSharedPath + "/hydrate.tsx.txt"
  ).text();

  const mods: { [key: string]: string } = {
    "<DEFAULT>": name,
    "<PATH>": indexPagePath,
  };

  for await (const i of Object.keys(mods)) {
    hydrateBasicFile = hydrateBasicFile.replaceAll(i, mods[i]);
  }
  const modifiedHydrateFile = hydrateBasicFile;
  const hydratePath = `.bunext/${url == "/" ? "" : `${url}/`}hydrate.tsx`;
  await Bun.write(hydratePath, modifiedHydrateFile);
  return hydratePath;
}

const init = async () => {
  let buildsPaths: string[] = [];
  const dirs = readdirSync(basePagePath, {
    recursive: true,
  });
  for await (const i of dirs as string[]) {
    if (!i.includes("index.")) continue;
    const pathList = i.split("/").slice(0, -1).join("/");
    buildsPaths.push(
      await createBuildFile(i, pathList.length == 0 ? undefined : pathList)
    );
  }

  const builds = await Bun.build({
    entrypoints: buildsPaths,
    target: "browser",
    splitting: true,
    /*minify: {
      identifiers: true,
      syntax: true,
      whitespace: true,
    },*/
  });

  for await (const build of builds.outputs) {
    const buildFormated = build.path.replace("./", "");
    buildsMatchers.set(
      buildFormated.startsWith("/")
        ? buildFormated.substring(1)
        : buildFormated,
      () =>
        new Response(build.stream(), {
          headers: {
            "Content-Type": build.type,
          },
        })
    );
  }
};

const serveBuild = (req: Request) => {
  const { pathname } = new URL(req.url);
  const buildFileRequest = buildsMatchers.get(pathname.slice(1));
  if (buildFileRequest) {
    return buildFileRequest();
  }
};

const serveRequestedPage = async (req: Request) => {
  const { pathname } = new URL(req.url);

  const asset = await _assetFileRouter.match(pathname);
  if (asset) return new Response(Bun.file(_assetFileRouter.getPath()));

  const route = _fileRouter.match(req);

  if (req.method === "GET" && route !== null) {
    const page = (await import(`${route.filePath}`)) as _fileRouterStruct;
    if (!page.default) throw new Error("no default was set");
    const pageContent = await page.default(route);
    const AppComponent = App({ children: pageContent });
    const renderReactStream = await ReactDOMServer.renderToReadableStream(
      AppComponent,
      {
        bootstrapModules: [`${pathname === "/" ? "" : pathname}/hydrate.js`],
      }
    );

    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });
    const streamManager = new WriteAsyncToStream({
      write: writable,
      reactStream: renderReactStream,
    });

    //streamManager.writeToStreamAsync();
    streamManager.proxyReactStream();

    return new Response(readable, {
      headers: {
        "content-type": "text/html",
      },
    });
  }
};

await init();
function createServer() {
  return Bun.serve({
    port: 3000,
    async fetch(req, server) {
      globalThis.session = new webToken(req, {
        cookieName: "bunext-seesion-id",
      });
      globalThis.sessionRemove = false;

      const buildFileRequest = serveBuild(req);
      if (buildFileRequest) return buildFileRequest;

      const pageRequest = await serveRequestedPage(req);

      if (pageRequest) {
        if (!globalThis.setSession) return pageRequest;
        return globalThis.session.setCookie(pageRequest, globalThis.setSession);
      }

      return new Response(
        JSON.stringify({ status: 404, message: "Not found" }),
        {
          status: 404,
        }
      );
    },
  });
}

class WriteAsyncToStream {
  private doneReact = false;
  private doneLocal = false;
  private writeStream: WritableStream<any>;

  private writer: WritableStreamDefaultWriter<any>;
  private reader: ReadableStreamDefaultReader<any>;

  private enableAsyncWrite = false;

  constructor({
    write,
    reactStream,
  }: {
    write: WritableStream<any>;
    reactStream: ReactDOMServerReadableStream;
  }) {
    this.writeStream = write;
    this.writer = this.writeStream.getWriter();

    const [, r] = reactStream.tee();
    this.reader = r.getReader();
  }

  tryCloseStream() {
    if (
      (this.doneReact && !this.enableAsyncWrite) ||
      (this.doneReact && this.doneLocal)
    ) {
      this.writer.close();
      return true;
    }
    return false;
  }
  forceCloseStream() {
    this.writer.close();
  }
  async writeToStreamAsync() {
    this.enableAsyncWrite = true;
    const iterations = 15;
    this.writer.write(
      new TextEncoder().encode(`
  <script>
    function $U(h, s) {
      document.getElementById(h)?.remove();
      document.getElementById(h.replace('ST', 'SR'))?.remove();
    }
  </script>
  `)
    );

    for (let i = 0; i <= iterations; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.round(Math.random() * 100))
      );

      let content = `<div id="ST-${i}">Iteration ${i}</div>`;

      if (i > 0) {
        content += `<script id="SR-${i}">$U("ST-${i - 1}","ST-${i}")</script>`;
      }

      if (i === iterations) {
        content += `<script id="SR-${i}">$U("SR-${i}","SR-${i}")</script>`;
      }

      this.writer.write(new TextEncoder().encode(content));
    }

    this.doneLocal = true;
    this.tryCloseStream();
  }
  async proxyReactStream() {
    let finish = false;
    while (!finish) {
      const { done, value } = await this.reader.read();

      if (done) {
        finish = true;
        this.doneReact = true;
        this.tryCloseStream();
        break;
      }

      this.writer.write(value);
    }
  }
}
