import { DynamicComponent } from "../../features/components";
import type { serveFrom } from "../onRequest/serveFrom";

export type Plugins = {
  onRequest: onRequest;
};

type onRequest = {
  /**
   * serve from a directory
   * for dynamic imports, build the file and serve it
   * @param directory the directory to serve from
   * @param request the request object
   * @param buildOptions the build options
   * @returns the response object
   * @example serveFrom({ directory: "/src/dynamic", request })
   * @example serveFrom({ directory: "/src/dynamic", request, buildOptions: { splitting: true } })
   */
  serveFrom: typeof serveFrom;
  components: {
    /**
     * @param pathName the path to the component
     * @param elementName the name of the component
     * @param props the props to pass to the component
     * @returns the component
     */
    DynamicComponent: typeof DynamicComponent;
  };
};
