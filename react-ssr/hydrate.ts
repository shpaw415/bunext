import { hydrate } from "bun-react-ssr/hydrate";
import { Shell } from "./shell";
import "./global";

await hydrate(Shell);
