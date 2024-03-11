const content = await Bun.file("test2.tsx").text();
const tranpiled = new Bun.Transpiler({
  target: "browser",
  loader: "tsx",
  deadCodeElimination: true,
  exports: {
    eliminate: new Bun.Transpiler({ loader: "tsx" }).scan(content).exports,
  },
  trimUnusedImports: true,
  jsxOptimizationInline: true,
}).transformSync(content);

console.log(tranpiled);
