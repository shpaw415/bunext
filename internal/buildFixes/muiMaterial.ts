import { PostProcessFix } from "../../bun-react-ssr/build";

const muiFix = new PostProcessFix("@mui/material", async ({ fileContent }) => {
  return "";
});

export default muiFix;
