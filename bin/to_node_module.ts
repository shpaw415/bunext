import { cp } from "node:fs/promises";
const glob = new Bun.Glob("**");

const res = glob.scan({ onlyFiles: true, dot: true });

const files = (await Array.fromAsync(res)).filter(
  (e) => !e.startsWith("node_modules") && !e.startsWith(".git")
);

await Promise.all(
  files.map((file) => {
    return cp(file, "node_modules/@bunpmjs/bunext/" + file, {
      recursive: true,
      force: true,
    });
  })
);

console.log("Done!");
