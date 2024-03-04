import { setHead } from "@bunpmjs/bunext/componants/head";
import { Button } from "./button";

setHead({
  data: {
    title: "My Bunext powered WebSite",
    author: "shpaw415",
    publisher: "bunpmjs",
  },
});

export default function page() {
  return (
    <>
      <h1>Hello World!</h1>
      <p>this is my Website</p>
      <Button content="Click on me!" />
    </>
  );
}

export async function ServerAction({ data }: { data: string }) {
  Bun.sleepSync(1000); // some backend work
  return "Data: " + data;
}
