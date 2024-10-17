import { revalidate } from "../features/router";

function setRevalidate(
  revalidates: {
    path: string;
    time: number;
  }[]
) {
  for (const reval of revalidates) {
    setInterval(async () => {
      await revalidate(reval.path);
    }, reval.time);
  }
}


export { setRevalidate };
