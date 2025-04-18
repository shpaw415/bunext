import type { ServerStart } from "./types";
import { Init } from "../../internal/server/router";

export default {
  async main() {
    await Init();
  },
  async cluster() {
    await Init();
  },
} as ServerStart;
