import { watchBuild } from "@bunpmjs/bunext/bun-react-ssr/watch";
import { doBuild } from "@bunpmjs/bunext/internal/build";
import { paths } from "@bunpmjs/bunext/globals";
import { sendSignal } from "@bunpmjs/bunext/dev/dev";

export const doWatchBuild = () =>
  watchBuild(async () => {
    await doBuild();
    sendSignal();
  }, [paths.basePagePath]);
