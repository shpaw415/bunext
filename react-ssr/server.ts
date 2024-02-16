import { doBuild } from "./build";
import { router } from "./routes";
import { Shell } from "./shell";

try {
  const server = Bun.serve({
    port: "3000",
    async fetch(request) {
      if (!request.url.endsWith(".js")) await doBuild();
      const response = serve(request);
      if (await response) return (await response) as Response;
      return new Response("Not found", {
        status: 404,
      });
    },
  });
  console.log("Serve on port:", server.port);
} catch {
  process.exit(0);
}

function serve(request: Request) {
  return router.serve(request, {
    Shell: Shell,
    bootstrapModules: [".bunext/react-ssr/hydrate.js"],
  });
}
