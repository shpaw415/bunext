import { BunextPlugin } from "../plugins/types";

const cwd = process.cwd();

export default {
  serverStart: {
    dev() {
      ["tailwind.config.ts", "tailwind.config.js"].forEach(async (fileName) => {
        const cwd = process.cwd();
        if ((await Bun.file(`${cwd}/${fileName}`).exists()) == false) return;
        globalThis.tailwind_enabled = true;
        const pathToTailwindCss = `${cwd}/static/input-tailwind.css`;
        const TailwindCssFile = Bun.file(pathToTailwindCss);
        if ((await TailwindCssFile.exists()) == false) {
          TailwindCssFile.write('@import "tailwindcss";');
        }
        /*await Bun.$`bunx @tailwindcss/cli -i ${cwd}/static/input-tailwind.css -o ${cwd}/static/style.css --watch`.cwd(
                cwd
              );*/
      });
    },
  },
  before_build_main: () => {
    Bun.$`bunx @tailwindcss/cli -i ./static/input-tailwind.css -o ./static/style.css`
      .cwd(cwd)
      .quiet();
  },
} as BunextPlugin;
