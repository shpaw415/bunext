import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
const glob = new Bun.Glob("**");

const res = glob.scan({ onlyFiles: true, dot: true });

const files = (await Array.fromAsync(res)).filter(
  (e) => !e.startsWith("node_modules") && !e.startsWith(".git")
);

await Promise.all(
  files.map(async (file) => {
    const dest = join("node_modules", "bunext-js", file);
    await mkdir(dirname(dest), { recursive: true });
    return cp(file, dest, {
      recursive: true,
      force: true,
    });
  })
);

console.log("Done!");
