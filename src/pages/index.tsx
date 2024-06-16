import { revalidateEvery } from "../../features/router";

export default function Page() {
  revalidateEvery("/", 1000);
  return <div>Some Test</div>;
}

export async function ServerAction() {
  return true;
}
