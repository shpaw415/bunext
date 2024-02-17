import { webToken } from "@bunpmjs/json-webtoken";
import { doBuild } from "./build";
import { router } from "./routes";
import { Shell } from "./shell";

declare global {
  var bunext_Session: webToken<any>;
  var bunext_SessionData: { [key: string]: any } | undefined;
  var bunext_SessionDelete: boolean;
}

globalThis.bunext_SessionDelete ??= false;

await doBuild();

try {
  const server = Bun.serve({
    port: "3000",
    async fetch(request) {
      initSession(request);

      if (!request.url.endsWith(".js")) await doBuild();
      const response = serve(request);
      if (await response) return setSessionToken((await response) as Response);
      return new Response("Not found", {
        status: 404,
      });
    },
  });
  console.log("Serve on port:", server.port);
} catch (e) {
  console.log(e);
  process.exit(0);
}

function serve(request: Request) {
  return router.serve(request, {
    Shell: Shell,
    bootstrapModules: [".bunext/react-ssr/hydrate.js"],
  });
}

function initSession(request: Request) {
  globalThis.bunext_Session = new webToken(request, {
    cookieName: "bunext_session_token",
  });
}

function setSessionToken(response: Response) {
  if (globalThis.bunext_SessionData) {
    return globalThis.bunext_Session.setCookie(response, {
      expire: 3600,
      httpOnly: true,
      secure: false,
    });
  } else if (globalThis.bunext_SessionDelete) {
    return globalThis.bunext_Session.setCookie(response, {
      expire: -10000,
      httpOnly: true,
      secure: false,
    });
  }
  return response;
}
