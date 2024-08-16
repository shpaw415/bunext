declare module "*.svg" {
  const Svg: (props?: React.HTMLProps<HTMLOrSVGElement>) => JSX.Element;
  export default Svg;
}
