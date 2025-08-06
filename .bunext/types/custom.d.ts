declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css" {
  const style: string;
  export default style;
}

declare module "*.svg" {
  import { FC, SVGProps } from "react";
  const Svg: FC<SVGProps<SVGSVGElement>>;
  export default Svg;
}

declare module "node_modules/@types/bun/node_modules/bun-types/extensions.d.ts" {
  export { }; // Empty export to shadow the original module
}
