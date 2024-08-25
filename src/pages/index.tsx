import { Head } from "@bunpmjs/bunext/features/head";
import { Link, revalidateEvery } from "@bunpmjs/bunext/features/router";
import { TestElement } from "./test";
import { useSession, GetSession, Session } from "../../features/session";
import { Database } from "../../database";
import { generateRandomString } from "../../features/utils";
import { TestServerElement } from "./serverElement";

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
  path: "/",
});

export default async function Page() {
  revalidateEvery("/", 5);

  return (
    <div>
      <TestElement />
      {TestServerElement()}
      <Link href="/other">
        <button>Other page</button>
      </Link>
      <button
        onClick={async () => {
          await ServerSetSession();
          Session.update();
        }}
      >
        {generateRandomString(5)}
      </button>
      <button
        onClick={async () => {
          await ServerDeleteSession();
          Session.update();
        }}
      >
        Delete Session
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
  const db = await Database();

  GetSession(arguments).setData(
    {
      test: true,
    },
    true
  );
}

export async function ServerDeleteSession() {
  GetSession(arguments).delete();
}
