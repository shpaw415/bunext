import type { Plugins } from "./type";

const PluginInit: Plugins = {
  create(plugin) {
    return plugin;
  },
};

export default PluginInit;
