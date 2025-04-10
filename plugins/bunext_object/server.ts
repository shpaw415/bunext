import { DynamicComponent } from "../../features/components";
import { serveFrom } from "../onRequest/serveFrom";
import type { Plugins } from "./type";

const PluginInit: Plugins = {
  onRequest: {
    serveFrom,
    components: {
      DynamicComponent,
    },
  },
};

export default PluginInit;
