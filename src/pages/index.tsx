import { Head } from "@bunpmjs/bunext/features/head";
import { revalidateEvery } from "@bunpmjs/bunext/features/router";
import { navigate } from "@bunpmjs/bunext/features/router";

Head.setHead({
  data: {
    author: "John Doe",
    title: "my Hompage",
    publisher: "Bunext",
    meta: [
      {
        name: "foo",
        content: "bar",
      },
    ],
  },
});

export default function Page() {
  revalidateEvery("/", 1000);
  return (
    <div>
      Some Test
      <button onClick={() => navigate("/other")}>Other page</button>
    </div>
  );
}

export async function ServerAction() {
  return true;
}
