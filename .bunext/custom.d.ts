declare module "*.svg" {
  const Svg: (props?: React.HTMLProps<HTMLOrSVGElement>) => JSX.Element;
  export default Svg;
}

declare module "*.css" {
  /** .css file path in /static */
  const Style: string;
  export default Style;
}
