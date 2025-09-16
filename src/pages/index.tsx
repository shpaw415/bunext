

import { TestElement } from "./test";
import { useSession, getSession } from "bunext-js/session";
import { generateRandomString } from "../../features/utils";
import { TestServerElement2 } from "./serverElement";

import { Head } from "public/head";
import { useEffect } from "react";


import "@static/style.css";

type SessionType = {
  test: boolean;
};


export function TestServerElement1() {
  return <div>ALLO: {Bun.password.hashSync("allô")}</div>;
}

function DynamicFileImport() {
  useEffect(() => {
    fetch("/node_modules/css_placeholder/index.css").then(async (res) => {
      console.log(await res.text());
    });
  }, []);

  return <></>;
}

/**
 * Renders the main page with navigation links, session controls, and test components.
 *
 * Includes UI elements for navigating to other pages, updating and deleting session data, triggering API calls, printing session information to the server console, and forcing server-side revalidation.
 *
 * @returns The main page JSX element.
 */
export default async function Page() {
  Bunext.router.revalidate.ssr.every("/", 10); // revalidate this page every 10 seconds
  return (
    <Head data={{
      title: "Main page",
      meta: [
        {
          name: "description",
          content: "This is the main page"
        }
      ]
    }}>
      <div>
        <TestElement />
        <TestServerElement1 />
        <TestServerElement2 />

        <TestElement3 />
        <Bunext.router.navigate.components.link href="/other">
          <button>Others pages</button>
        </Bunext.router.navigate.components.link>
        <SetSessionButton />
        <DeleteSessionButton />
        <button onClick={() => fetch("/api/v1", { method: "POST" })}>api</button>
        <button onClick={() => ServerPrintSession()}>
          Print session to server console
        </button>
        <button onClick={async () => await ServerRevalidateNow()}>
          Revalidate now
        </button>
        <Bunext.router.navigate.components.link href="/dynamic">
          <button>Goto dynamic</button>
        </Bunext.router.navigate.components.link>
        <IsLogged />
        <DynamicFileImport />
        <Bunext.router.navigate.components.link href="/dynamic/static/test/">
          <button>Other page</button>
        </Bunext.router.navigate.components.link>
      </div>
    </Head>
  );
}


export function TestElement4() {
  return <div>{Bun.hash("allô").toLocaleString()}</div>;
}

function SetSessionButton() {
  const session = useSession();
  const random = generateRandomString(5);
  return (
    <button
      onClick={() => ServerSetSession()}
      className="bg-red-500 border-blue-300 border-4"
    >
      update session
      {random}
    </button>
  );
}

function DeleteSessionButton() {
  const session = useSession();
  return <button onClick={async () => session.delete()}>Delete Session</button>;
}

export function TestElement3({ params }: { params?: any }) {
  return (
    <div className="some-css">
      <div>test</div>
    </div>
  );
}

function IsLogged() {
  const session = useSession<SessionType>();
  const data = session.getData();
  const isLogged = Boolean(data?.test);
  return <div>{isLogged ? "logged" : "not logged"}</div>;
}

export async function ServerSetSession() {
  const session = getSession(arguments);
  session.setData(
    {
      test: true,
    },
    true
  );
  session.setData({ private: true }, false);
}

export async function ServerPrintSession() {
  console.log(Bunext.version);
  console.log(getSession(arguments).getData());
}

export async function ServerDeleteSession() {
  getSession(arguments).delete();
}

export async function ServerRevalidateNow() {
  await Bunext.router.revalidate.ssr.now("/");
}
