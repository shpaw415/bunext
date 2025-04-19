import { BunextPlugin } from "../plugins/types";
const cwd = process.cwd();

export default {
  serverStart: {
    async dev() {
      for await (const fileName of [
        "tailwind.config.ts",
        "tailwind.config.js",
      ]) {
        if ((await Bun.file(`${cwd}/${fileName}`).exists()) == false) continue;
        globalThis.tailwind_enabled = true;
        const pathToTailwindCss = `${cwd}/static/input-tailwind.css`;
        const TailwindCssFile = Bun.file(pathToTailwindCss);
        if ((await TailwindCssFile.exists()) == false) {
          await TailwindCssFile.write('@import "tailwindcss";');
        }
      }
    },
  },
  before_build_main: () =>
    Bun.$`bunx @tailwindcss/cli -i ./static/input-tailwind.css -o ./static/style.css`
      .cwd(cwd)
      .quiet(),
} as BunextPlugin;
