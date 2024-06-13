import { watchBuild } from "../bun-react-ssr/watch";
import { sendSignal } from "../dev/hotServer";
import { paths } from "./globals";
import "../dev/dev";

export const doWatchBuild = (showError: boolean) =>
  watchBuild(async () => {
    sendSignal();
  }, [paths.basePagePath, "static"]);
