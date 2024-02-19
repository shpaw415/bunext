import { hydrate } from "bun-react-ssr/src/hydrate";
import { Shell } from "./shell";
import "./global";

await hydrate(Shell);
