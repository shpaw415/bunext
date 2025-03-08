declare module "*.css" {
  const Style: string;
  export default Style;
}

declare module "*.svg" {
  import { FC, SVGProps } from "react";
  const Svg: FC<SVGProps<SVGSVGElement>>;
  export default Svg;
}

declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}
