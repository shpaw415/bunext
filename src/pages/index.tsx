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
import { TestServerElement2 } from "./serverElement";
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

export function TestServerElement1() {
  return <div>{Bun.password.hashSync("allo")}</div>;
}

export default async function Page() {
  revalidateEvery("/", 5);

  return (
    <div>
      <TestElement />
      <TestServerElement1 />
      {TestServerElement2()}
      <TestElement3 />
      <Link href="/other">
        <button>Other pages</button>
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
          Session.delete();
        }}
      >
        Delete Session
      </button>
      <button onClick={() => ServerPrintSession()}>
        Print session to server console
      </button>
      <button onClick={async () => await ServerRevalidateNow()}>
        Revalidate now
      </button>
      <IsLogged />
    </div>
  );
}

export function TestElement3({ params }: { params?: any }) {
  return (
    <div>
      <div>test</div>
    </div>
  );
}

function IsLogged() {
  const session = useSession();
  const data = session.getData();
  const isLogged = Boolean(data?.test);
  //console.log(session.getData());
  return <div>{isLogged ? "logged" : "not logged"}</div>;
}

export async function ServerSetSession() {
  const db = Database();

  GetSession(arguments).setData(
    {
      test: true,
    },
    true
  );
}

export async function ServerPrintSession() {
  console.log(GetSession(arguments).getData());
}

export async function ServerDeleteSession() {
  GetSession(arguments).delete();
}

export async function ServerRevalidateNow() {
  await revalidate("/");
}
