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

function ClientButton() {
  return <button>ClientSide</button>;
}

export async function AsyncComponant() {
  //Bun.sleepSync(1000);
  return (
    <h1>
      Awaiting
      <ClientButton />
    </h1>
  );
}

console.log(AsyncComponant() instanceof Promise);

//console.log(reactElementToJSXString(<>{await AsyncComponant()}</>));
