import { Head } from "@bunpmjs/bunext/features/head";
import { revalidateEvery } from "@bunpmjs/bunext/features/router";
import { navigate } from "@bunpmjs/bunext/features/router";
import { TestElement } from "./test";
import { useSession } from "../../features/session";
import { GetSession } from "../../features/session";

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
      <TestElement />
      <button onClick={() => navigate("/other")}>Other page</button>
      <button onClick={async () => await ServerSetSession()}>
        Set Session
      </button>
      <IsLogged />
    </div>
  );
}

function IsLogged() {
  const session = useSession();
  const data = session.getData();
  return <div>{data?.test ? "logged" : "not logged"}</div>;
}

export async function ServerSetSession() {
  const session = GetSession(arguments);

  /*session.setData(
    {
      test: true,
    },
    true
  );*/
  console.log(session.getData());
}
