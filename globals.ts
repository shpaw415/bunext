export const paths = {
  bunextDirName: ".bunext",
  bunextModulePath: "node_modules/@bunpmjs/bunext",
  basePagePath: "src/pages",
  staticPath: "static",
} as const;

export const names = {
  bunextModuleName: "bunext",
  loadScriptPath: "/bunext-scripts",
} as const;

export const exitCodes = {
  build: 102,
  runtime: 101,
} as const;
