import { fnToString } from "./utils";

type ScriptType = "text/javascript";

export function Script({
  src,
  type,
  scriptProps,
  children,
  call,
}: {
  src: Function;
  type?: ScriptType;
  children?: any;
  scriptProps?: React.DetailedHTMLProps<
    React.ScriptHTMLAttributes<HTMLScriptElement>,
    HTMLScriptElement
  >;
  call?: boolean;
}) {
  const transpiler = new Bun.Transpiler({
    loader: "ts",
  });
  return (
    <script {...scriptProps} type={type || "text/javascript"}>
      {transpiler.transformSync(fnToString(src))}
      {call && src.name + "();"}
      {children}
    </script>
  );
}
