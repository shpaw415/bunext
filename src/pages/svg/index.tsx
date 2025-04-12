import type { JSX } from "react";
import Icon from "./icon.svg";
export default function SVGTestPage() {
  return <div>{Icon({ fill: "red" }) as JSX.Element}</div>;
}
