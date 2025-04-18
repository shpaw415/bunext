import { builder } from "../../internal/server/build";
import type { ServerStart } from "./types";

export default {
  dev() {
    builder.clearBuildDir();
  },
} as ServerStart;
