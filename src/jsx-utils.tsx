import { fnToString } from "./utils";

type ScriptType = "text/javascript" | "module" | "";

export function Script({
  src,
  url,
  type,
  scriptProps,
  children,
  call,
}: {
  src?: Function | string;
  url?: string;
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

  const inserter: () => string = () => {
    switch (typeof src) {
      case "string":
        return src || "";
      case "function":
        const _srcFunction = src as Function;
        return `${transpiler.transformSync(fnToString(_srcFunction))} ${
          call && _srcFunction.name + "();"
        } ${children || ""}`;
      default:
        return "";
    }
  };

  return (
    <script
      {...scriptProps}
      type={type || "text/javascript"}
      className={scriptProps?.className || "" + "bunext-script-Element"}
      dangerouslySetInnerHTML={{
        __html: inserter(),
      }}
      src={url}
    ></script>
  );
}
