import { DynamicComponent } from "../../features/components";
import type { Plugins } from "./type";

const PluginInit: Plugins = {
  onRequest: {
    components: {
      DynamicComponent,
    },
  },
};

export default PluginInit;
