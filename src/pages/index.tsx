import { Head } from "../../features/head";
import { revalidateEvery } from "../../features/router";
import { navigate } from "../../features/router";
import { TestElement } from "./test";
import { useSession, GetSession, Session } from "../../features/session";
import { Database } from "../../database";
import { generateRandomString } from "../../features/utils";
import { TestServerElement } from "./serverElement";

export default async function Page() {
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
  revalidateEvery("/", 5);
  return (
    <div>
      <TestElement />
      {TestServerElement()}
      <button onClick={() => navigate("/other")}>Other page</button>
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
