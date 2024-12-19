//@ts-ignore
import { toJSON } from "cssjson";

const data = toJSON(
  await Bun.file("./static/login/index.css").text(),
  undefined
);

console.log(
  Object.keys(data.children).map((e) => {
    if (e.startsWith(".")) e = e.replace(".", "");
    if (e.startsWith("#")) e = e.replace("#", "");
  })
);
