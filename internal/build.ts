import { Builder } from "../bun-react-ssr/build";
import "./server_global";
export { makeBuild } from "./makeBuild";

export const builder = await new Builder(process.cwd()).Init();
