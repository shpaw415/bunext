/*
import { Transpiler } from "bun";

const transpile = new Transpiler({
  loader: "tsx",
  treeShaking: true,
  trimUnusedImports: true,
});
const content = await Bun.file("test.tsx").text();
const transpiled = transpile.transformSync(content);

console.log(transpiled);
*/

import reactElementToJSXString from "react-element-to-jsx-string";

function ClientButton() {
  return <button>ClientSide</button>;
}

export function AsyncComponant({
  children,
}: {
  children: JSX.Element | string;
}) {
  return (
    <h1>
      Awaiting
      <ClientButton />
      {children}
    </h1>
  );
}

console.log(reactElementToJSXString(<AsyncComponant>Allo</AsyncComponant>));
