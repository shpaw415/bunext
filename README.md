# Compatibility

compatible Runtime: bun 1.1.0 - 1.1.29
compatible OS: Linux, WSL

N.B : Bun is in continuous change and compatibility between version is a

problem for Bunext there is possible crash over some new version of Bun.

I will keep up to date the framework for what it needs

# bunext

- Nextjs Framwork compatible with Bun Runtime

- Facing problemes? [Open an issue ](https://github.com/shpaw415/bunext/issues)

## Updating to a new Version

When an update of Bunext is made you must run:

```Bash
#!/usr/bin/env bash
bun bunext init
bun run db:create # only create the types
```

## What is planed

- Documentation

- SQlite performance & features

- Windows compatibility

## What is ready

- Multi-Thread Http Worker ( bun ^1.1.25 & Linux only )

- SSR and CSR

- layout stacking

- React

- Static assets

- Server componants ("use server" & "use client")

- Revalidate ( Beta )

- Server action ( File, File[] and FormData can be uploaded )

- Session Management ( public & private )

- SQlite Management ( Beta )

- Server componants ( Beta )

- Devloppement mode with Hot Reload ( beta version )

- Production mode ( Beta )

- Links

- SVG support ( Beta )

### To install and run

```Bash
#!/bin/env bash
bun i @bunpmjs/bunext || bunpm install bunext
bun bunext init
bun run dev
```

### Run in Production mode

```Bash
#!/bin/env bash
bun run build # this just make sure your build folder is created and ready to start
bun run start # Enjoy!!!
```

## Documentation

Here is the summary of the framework docs.
I will soon make a website making it more simple, clear and fun to read.
Thanks to all people how are following my work!

## Router

Like NextJs the routes are in src/pages.

- _index.tsx_ is the main page for the route
- _[id].tsx_ is a dynamic page loading and is a good oportunity to use getServerSideProps
- _layout.tsx_ is the layout for the current route and sub-directory routes

```Javascript XML
//index.tsx
export default function Page() {
  return <div>My page</div>
}

```

## Session

Manage the session from your users by setting a
session and optionaly make it accessible from the client side ( default to only Server Side ).

- SetData only from the Server Side is allowed.
- Delete Session data can be Client or Server Side
- GetData can be Client or Server Side ( but Client only have access to what is made public )

  - **useSession**
  - will automaticaly update the element when the session is updated

### Set Session data

```JavaScript XML
import { GetSession, useSession } from "@bunpmjs/bunext/features/session";

export default function Page() {
  return (
    <div>
      <LoggedIndicator />
      <SetSession />
    </div>
  );
}

function SetSession() {
  const session = useSession({
    PreventRenderOnUpdate: true,
  });
  return (
    <button
      onClick={async () => {
        await ServerSetSession({
          username: "foo",
          password: "bar",
        });
        session.update();
/*
Will update every React Element using useSession
without PreventRenderOnUpdate
*/
      }}
    >
      Click to update Session
    </button>
  );
}

function LoggedIndicator() {
  const session = useSession();
  return (<span>
      {session.getData()?.username ? `logged as ${session.getData().username}` : "not logged"}
    </span>);
}

export async function ServerSetSession({
  username,
  password,
}: {
  usename: string;
  password: string;
}) {
  const Session = GetSession(arguments);
  Session.setData(
    {
      username: username,
    },
    true
  ); // accessed from Client & Server Side
  Session.setData(
    {
      password: password,
    },
    false
  ); // Only accessed from Server Side
}

```

### Get Session data

```Javascript XML
import { useSession } from  "@bunpmjs/bunext/features/session";
export default function Page() {
	return <div>
		<ReactElement />
	</div>
}

function ReactElement() {
	const session = useSession();
	return <span>{session.getData()?.username || "not logged"}</span>
}
```

### Delete Session

```Javascript XML
// index.tsx
import {
  useSession,
  GetSession
} from  "@bunpmjs/bunext/features/session";

export default function Page() {
	return <div>
		<ReactElement />
	</div>


}
// using a JS event from a React Element
function ReactElement() {
	const session = useSession();
	return <button onClick={() => session.delete()}>Click to delete the session</button>
}

// using a serverAction
export async function ServerDeleteSesion() {
	GetSession(arguments).delete();
	return "Session has been deleted by the server"
}

// using an API endpoint
export function GET(request: BunextRequest) {
  GetSession(arguments).delete();
  request.response = new Response("Session Deleted");
  return request;
}
```

## Server Action

Like Next offer a ServerAction method Bunext does it as well.
Key informations:

- Works with _use server_ and _use client_
- Server Action name should always start with **Server** key word
- Server Action must be **exported async function**
- It can be called like a normal async function from the client side
- File must be on the **first level of params** you cannot put a file in an object
- File Array is supported

```Javascript XML
// index.tsx
export default function FormPage() {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const res = await ServerUploadFile(
          {
            username: form.get("username") as string,
            password: form.get("password") as string,
          },
          form.get("file") as File
        );
        alert(JSON.stringify(res));
      }}
    >
      <input type="file" name="file" />
      <input type="text" placeholder="username" name="username" />
      <input type="text" placeholder="password" name="password" />
      <button type="submit">Send</button>
    </form>
  );
}

export async function ServerUploadFile(
  {
    username,
    password,
  }: {
    username: string;
    password: string;
  },
  file: File
) {
  // do stuff
  await Bun.write("path/" + file.name, file);
  return {
    success: true,
    message: "file saved successfuly",
  };
}

```

### Server Componants

Bunext offer a Server Componants ability that is managed with revalidate.
Will run only once at build time and when revalidate is ran.

- unless **"use client"** directive is set, exported function will be verify as a server Componant.
- Must be empty props.
- **Must be exported** and can be async as well.
- revalidate will invalidate every componants that are in the page.

```Javascript XML
// index.tsx

export default async function Page() {
  return (
    <div>
      {await Componants()}
      <NotValid />
    </div>
  );
}
// valid Server Componant
export async function Componants() {
  const res = await (await fetch("https://some-api.com/api")).json();
  return <div>{JSON.stringify(res)}</div>;
}

// not valid Server Componant
export function NotValid({ someProps }: { someProps: string }) {
  return <div></div>;
}

```

### Revalidate a Server Componant

```Javascript XML
// index.tsx
import { revalidateEvery, revalidate } from "@bunpmjs/bunext/features/router";
export default function Page() {
  revalidateEvery("/", 3600);
  // will revalidate the page at every 3600 second
  return <div>
    <button onClick={() => ServerRevalidate("/")}>Revalidate / path</button>
  </div>;
}

export async function ServerRevalidate(path: string) {
  await revalidate(path);
  // will revalidate the page right now
}

```

## GetServerSideProps

Load dynamic data directly into the main React Element.

```Javascript XML
// Request URL /informationID
// [id].tsx
export default function Page(data: {
  props: {
    foo: string,
    name: {
      john: string
      }
    },
  params: {
    id: string
  }
  }) {
    return <div>{data.props.foo + " - " + data.params.id}</div> // bar - informationID
  }


export async function getServerSideProps() {
  // go get some api data, database, etc...

  // return { redirect: "/path/to/another/location" };
  // will redirect to a diferent location
  return {
    foo: "bar",
    name: {
      john: "Doe"
    }
  };
}
```

## Database

### Configure the database

In **/config/database.ts** is for the database Shema.

this is pretty much a basic structure that will make type safe your database call.

Exemple:

```TypeScript
const MyDatabaseShema: DBSchema = [
  {
    name: "Users",
    columns: [
      {
        name: "id",
        type: "number",
        unique: true,
        autoIncrement: true,
        primary: true,
      },
      {
        name: "username",
        unique: true,
        type: "string",
      },
      {
        name: "test",
        type: "boolean",
      },
      {
        name: "foo",
        type: "json",
        DataType: [
          {
            foo: "string",
            bar: ["number"],
          },
        ],
      },
    ],
  },
];


export default MyDatabaseShema;

```

#### Create the database and Type

run this script

```bash
#!/bin/bash
bun run db:create
```

### Query the Database

Database is only allowed in Server Side

- select => Array of rows containing what you selected ( default to everything )
- delete => void
- insert => void
- update => void

```Javascript XML
// index.tsx
import { Database } from "@bunpmjs/bunext/database";

//in a Server Componant
export async function ReactElement() {
  const db = Database();

  return (
    <div>
      {db.tableName
        .select({
          select: {
            column1: true,
            column2: true,
          },
          where: {
            OR: [
              {
                column1: "foo",
                column2: "bar",
              },
              {
                column1: "fizz",
                column2: "buzz",
              },
            ],
          },
        })
        .map((row) => {
          /*...doStuff*/
        })}
    </div>
  );
}

```

## Router

### Navigate

two methods to navigate to another page

```Javascript XML
// index.tsx
import { navigate, Link } from "@bunpmjs/bunext/internal/router";
function NextPage() {
  return <>
    <button onClick={() => navigate("/new/location")}>Next page</button>
    <Link href="/new/location">
      <button>Next Page</button>
    </Link>
  </>;
}

```

## Set Head meta data

- set _path_ to the wanted route or \* for every routes
- will be revalidate on build time ( can be dynamic )

```Javascript XML
// /index.tsx
import { Head } from "@bunpmjs/bunext/features/head";

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
    link: [
      {
        rel: "stylesheet",
        href: "main.css"
      }
    ]
  },
  path: "/otherPath",
});
```

## Run Script at Startup

config/preload.ts will run at startup

## Configure Server

config/server.ts contain server related configuration

## Bypass request

To make a custom Response in _config/onRequest.ts_,
return (Response or async Response) to bypass the default behaviour, or
return undefined to use the default behaviour.

## API Endpoint

- access the Endpoint via src/pages as root

```TypeScript
import type { BunextRequest } from "@bunpmjs/bunext/features/request";

// /src/pages/api/v1/index.ts
export function POST(request: BunextRequest) {
  request.response = new Response("POST");
  return request;
}

export function GET(request: BunextRequest) {
  request.response = new Response("GET");
  return request;
}

export function PUT(request: BunextRequest) {
  request.response = new Response("PUT");
  return request;
}

export function DELETE(request: BunextRequest) {
  request.response = new Response("DELETE");
  return request;
}


// Client request
await fetch("my.site.com/api/v1", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" })
}); // return the post data
```

# Change Log

### 0.6.17

- Fix Fetch cache no store now works

### 0.6.18

- Fix SVG not showing completely
- Fix async Layout error on SSR & CSR rendering
- Fix ServerComponant style prop not showing correcly causing hydration error

## 0.6.19

- Fix Regression build crash introduced in 0.6.18

## 0.7.0

- Fix production mode not initializing ServerAction (sorry for that)
- Multi-threading on production mode when ServerConfig HTTPServer.threads is set to more then 1 or all_cpu_core (default: 1)

## 0.7.1

- Fix Missing Type for ServerConfig thread

## 0.7.2

- Fix page not loading correcly when there is no layout
- Fix async layout in the hydration step
- Improve compatibility with the multi-thread feature (will skip multi-thread on windows or mac) and now the main thread is making build and send the builded info to the workers
- Other small improvement

## 0.7.3

- Fix server not waiting for the build to finish before sending the response causing hydration error
- Other small improvement

## 0.7.4

- Fix getServersideProps taking time before responding
- Performance improvement

## 0.7.5

- Head path param is now required
- Head path param can be \* and apply to every page

## 0.7.7

- Head display order modified path \* is overwriten by the current path
- Head data is now deep merged now meta and links are stacked

## 0.7.8

- env variables can be made public by adding PULIC keyword.
  Ex:
  PUBLIC_API_KEY="abcdefghijklmnop12345678" // can be accessed from client and server
  API_KEY="abcdefghijklmnop12345678" // only accessed from server side

- css can now be loaded direcly in the page as a link in /static path
- @static path is now accessible to direcly access /static path

## 0.7.9

- Fix missing global
- file[] as prop in Server Action is supported
- FormData as single prop in Server Action is supported

## 0.7.10

- Fix Database key with special char would break the types
- node_modules files can be imported as link ts and tsx files is compiled to js files ( beta ) ( css works )
- Fix import not working in Server Componants
- Fix import problem in production mode ( bun changed something in the minifing feature that broke the build for some reason )

## 0.7.13

- Database is no longer async
- File and Blob can be returned from a Server Action
- Fix Head data not loading with dynamic routes

## 0.7.15

- Session can be hosted on the server as a token and remove the limit of the standard 4000 char, when serverConfig.session.type = "database:memory" | "database:hard"
  and "cookie" will set as JSON-Webtoken but is limited with 4000 encoded char ( database:hard is the most stable for performance )

## 0.7.16

- getServerSideProps can access session with getSession
- fix getServersideProps not hot reloading
- fix session not loading correcly when a token is valid but not present in the session database
- minify is working on production
- fit jsx import for some tsx files that was not on the index but imported by it.
- fix session delete client side
- fix hot reload server can be set to a different number then 3001
- ServerActions are 95% smaller in bundle size
