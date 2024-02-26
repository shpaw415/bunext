import { Button } from "./button";

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
