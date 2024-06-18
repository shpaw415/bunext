/**
 * this fix is for @mui/material
 */

import type { BunPlugin } from "bun";

const Plugin: BunPlugin = {
  name: "MUI_Bunext_Plugin",
  target: "browser",
  setup(build) {
    build.onLoad(
      {
        filter: /@mui\/material\/styles\/styled.js$/,
      },
      async ({ path }) => {
        const transformed = async () => {
          const fileContent = await Bun.file(path).text();
          return fileContent
            .replace("{ default as createStyled }", "createStyled")
            .replace(
              "const styled = createStyled",
              "const styled = createStyled.default"
            );
        };

        return {
          contents: await transformed(),
        };
      }
    );
  },
};

export default Plugin;
