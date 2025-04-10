import { DynamicComponent } from "../../features/components";
import type { Plugins } from "./type";

const PluginInit: Plugins = {
  onRequest: {
    serveFrom: () => {
      throw new Error("Plugin to use in config/onRequest.ts");
    },
    components: {
      DynamicComponent,
    },
  },
};

export default PluginInit;
