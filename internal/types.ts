import type { _GlobalData } from "../bun-react-ssr/types";
import type { _Head } from "../componants/head";

export type _globalThis = _GlobalData & {
  __HEAD_DATA__: Record<string, _Head>;
};
