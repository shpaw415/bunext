import { Head } from "@bunpmjs/bunext/features/head";
import {
  Link,
  revalidate,
  revalidateEvery,
} from "@bunpmjs/bunext/features/router";
import { TestElement } from "./test";
import {
  useSession,
  GetSession,
  Session,
} from "@bunpmjs/bunext/features/session";
import { Database } from "@bunpmjs/bunext/database";
import { generateRandomString } from "../../features/utils";
import { TestServerElement } from "./serverElement";

import Test from "../../static/index.css";

Head.setHead({
  data: {
    title: "my Hompage",
    meta: [
      {
        name: "foo",
        content: "bar",
      },
    ],
    link: [
      {
        rel: "stylesheet",
        href: Test,
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
      <button onClick={async () => await ServerRevalidateNow()}>
        Revalidate now
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

export async function ServerRevalidateNow() {
  await revalidate("/");
}
