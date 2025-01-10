# Compatibility

compatible Runtime: bun 1.1.0 - 1.1.43
compatible OS: Linux, WSL

N.B : Bun is in continuous change and compatibility between version is a

problem for Bunext there is possible crash over some new version of Bun.

I will keep up to date the framework for what it needs

# bunext

- Nextjs inspired Framework compatible with Bun Runtime

- Facing problems? [Open an issue ](https://github.com/shpaw415/bunext/issues)

## Updating to a new Version

When an update of Bunext is made you must run:

```Bash
#!/usr/bin/env bash
# this is temporary and will change in future release
bun bunext init
bun run db:create # only create the types
```

## What is planed

- Documentation

- React 19 & React Compiler

- SQlite performance & features

  - Database merging ( bun db:merge )
  - Transaction

- Windows compatibility

## What is ready

- Multi-Thread Http Worker ( bun ^1.1.25 & Linux only )

- process.env ( Client + Server & Only Server )

- SSR and CSR

- layout stacking

- React

- Static assets

- Server components ("use server" & "use client")

- Revalidate ( Beta )

- Server action ( File, File[] and FormData can be uploaded )

- Session Management ( public & private )

- SQlite Management ( Beta )

- Server components ( Beta )

- Développement mode with Hot Reload ( beta version )

- Production mode ( Beta )

- Links

- SVG support

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
- _[id].tsx_ is a Dynamic Segment can be created by wrapping a file or folder name in square brackets: [segmentName]. For example, [id] or [slug].
- _layout.tsx_ is the layout for the current route and sub-directory routes

```Javascript XML
//index.tsx
export default function Page() {
  return <div>My page</div>
}

//[action]/[id].tsx

type Params = {
  action: string;
  id: string;
};

export default function DynamicPage({params}:{params: Params}) {
  return (
    <div>
      action: {params.action} 
      id: {params.id}
    </div>
  );
}
```

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

## Session

Manage the session from your users by setting a
session and optionally make it accessible from the client side ( default to only Server Side ).

- SetData only from the Server Side is allowed.
- Delete Session data can be Client or Server Side
- GetData can be Client or Server Side ( but Client only have access to what is made public )

  - **useSession**
  - will automatically update the element when the session is updated

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

type SessionType = {
  username: string
};

function SetSession() {
  const session = useSession<SessionType>({
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
  username: string;
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

type SessionType = {
  username: string
};

function ReactElement() {
	const session = useSession<SessionType>();
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

type SessionType = {
  username: string
};

// using a JS event from a React Element
function ReactElement() {
	const session = useSession<SessionType>();
	return <button onClick={() => session.delete()}>Click to delete the session</button>
}

// using a serverAction
export async function ServerDeleteSession() {
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
    message: "file saved successful",
  };
}

```

### Server Components

Bunext offer a Server Components ability that is managed with revalidate.
Will run only once at build time and when revalidate is ran.

- unless **"use client"** directive is set, exported function will be verify as a server Component.
- Must be empty props.
- **Must be exported** and can be async as well.
- revalidate will invalidate every components that are in the page.

```Javascript XML
// index.tsx

export default async function Page() {
  return (
    <div>
      {await Components()}
      <NotValid />
    </div>
  );
}
// valid Server Component
export async function Components() {
  const res = await (await fetch("https://some-api.com/api")).json();
  return <div>{JSON.stringify(res)}</div>;
}

// not valid Server Component
export function NotValid({ someProps }: { someProps: string }) {
  return <div></div>;
}

```

### Revalidate a Server Component

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

export async function ServerRevalidate(paths: string[]) {
  await revalidate(...paths);
  // will revalidate all pages in paths right now
}

```

## GetServerSideProps

Load dynamic data directly into the main React Element.

```Javascript XML

type Props = {
  foo: string;
  name: {
    john: string;
  }
};

type Params = {
  action: string;
  id: string;
}

// [action]/[id].tsx
export default function Page({props, params}: {
  props: Props
  params: Params
  }) {
    return <div>{props.foo + " - " + params.id}</div>
  }


export async function getServerSideProps(): Props {
  // go get some api data, database, etc...

  // return { redirect: "/path/to/another/location" };
  // will redirect to a different location
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

In **/config/database.ts** is for the database Schema.

this is pretty much a basic structure that will make type safe your database call.

Exemple:

```TypeScript
import { Union } from "@bunpmjs/bunext/database/schema";

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
        name: "role",
        type: "string",
        union: ["admin", "user"]
      },
      {
        name: "info",
        type: "json",
        DataType: {
          cart: [{
            type: Union("drink", "food", "other"),
            quantity: "number",
          }]
        },
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

//in a Server Component
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

## Set Head meta data

- set _path_ to the wanted route or \* for every routes
- will be revalidate on build time ( can be dynamic )

```Javascript XML
// /index.tsx
import { Head } from "@bunpmjs/bunext/features/head";

Head.setHead({
  data: {
    author: "John Doe",
    title: "my Home-page",
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

## SVG
use svg file as component you can import
- must be called as a Function in a Server Component
- can be called in a XML Version in Client Component

```Javascript XML
// index.tsx
import SVGIcon from "./my-svg.svg";

export default function Page() {
  return (
    <div>
      {SVGIcon()}
      <Element />
    </div>
  );
}

function Element() {
  return <SVGIcon className="icon" />
}

```


## Run Script at Startup

config/preload.ts will run at startup

## Configure Server

config/server.ts contain server related configuration

## Bypass request

To make a custom Response in _config/onRequest.ts_,
return (Response or async Response) to bypass the default behavior, or
return undefined to use the default behavior.

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

# Process.env

An environment variable can be set as public and accessed in a client context if the key starts with PUBLIC

```
PUBLIC_API_KEY="some-public-api-key"
API_KEY="private-api-key"
```


## Benchmark

Computer specs:
  - CPU: i7-9750H - 6 cores / 12 Threads
  - RAM: 32GB DDR4


### Single Threaded
![Single-Threaded](https://raw.githubusercontent.com/shpaw415/bunext/refs/heads/main/benchmark/wrk-benchmark-single-thread.png)

### Multi-Threaded (12 Threads)

![Multi-Threaded](https://raw.githubusercontent.com/shpaw415/bunext/refs/heads/main/benchmark/wrk-benchmark-multi-threaded.png)

# Change Log

## 0.6.17

- Fix Fetch cache no store now works

## 0.6.18

- Fix SVG not showing completely
- Fix async Layout error on SSR & CSR rendering
- Fix ServerComponent style prop not showing correctly causing hydration error

## 0.6.19

- Fix Regression build crash introduced in 0.6.18

## 0.7.0

- Fix production mode not initializing ServerAction (sorry for that)
- Multi-threading on production mode when ServerConfig HTTPServer.threads is set to more then 1 or all_cpu_core (default: 1)

## 0.7.1

- Fix Missing Type for ServerConfig thread

## 0.7.2

- Fix page not loading correctly when there is no layout
- Fix async layout in the hydration step
- Improve compatibility with the multi-thread feature (will skip multi-thread on windows or mac) and now the main thread is making build and send the builded info to the workers
- Other small improvement

## 0.7.3

- Fix server not waiting for the build to finish before sending the response causing hydration error
- Other small improvement

## 0.7.4

- Fix getServerSideProps taking time before responding
- Performance improvement

## 0.7.5

- Head path param is now required
- Head path param can be \* and apply to every page

## 0.7.7

- Head display order modified path \* is overwritten by the current path
- Head data is now deep merged now meta and links are stacked

## 0.7.8

- env variables can be made public by adding PUBLIC keyword.
  Ex:
  PUBLIC_API_KEY="abcdefghijklmnop12345678" // can be accessed from client and server
  API_KEY="abcdefghijklmnop12345678" // only accessed from server side

- css can now be loaded directly in the page as a link in /static path
- @static path is now accessible to directly access /static path

## 0.7.9

- Fix missing global
- file[] as prop in Server Action is supported
- FormData as single prop in Server Action is supported

## 0.7.10

- Fix Database key with special char would break the types
- node_modules files can be imported as link ts and tsx files is compiled to js files ( beta ) ( css works )
- Fix import not working in Server Components
- Fix import problem in production mode ( bun changed something in the minifying feature that broke the build for some reason )

## 0.7.13

- Database is no longer async
- File and Blob can be returned from a Server Action
- Fix Head data not loading with dynamic routes

## 0.7.15

- Session can be hosted on the server as a token and remove the limit of the standard 4000 char, when serverConfig.session.type = "database:memory" | "database:hard"
  and "cookie" will set as JSON-Webtoken but is limited with 4000 encoded char ( database:hard is the most stable for performance )

## 0.7.22

- getServerSideProps can access session with getSession
- fix getServerSideProps not hot reloading
- fix session not loading correctly when a token is valid but not present in the session database
- minify is working on production
- fit jsx import for some tsx files that was not on the index but imported by it.
- fix session delete client side
- fix hot reload server can be set to a different number then 3001
- ServerActions are 95% smaller in bundle size
- fix hot reload on dev mode for ServerActions
- head data is no longer merged
- hope it's the final fix for the compiler!

## 0.7.23

- fix serverAction not sending multiple props
- fix database select where with key that value was undefined break the request

## 0.8.0

- Production mode compatible with Bun v-1.1.34
- Performance enhancement!
- fix layout re import when NODE_ENV is in production

## 0.8.4

- Prevent future compatibility issue
- Performance enhancement in production mode for Dynamic page like \[id\].tsx

## 0.8.9 (tmp fix for bun import problem in production mode)

- add a plugin to fix Bun import some time breaking the request

## 0.8.11

- Fix crash on dev mode when a cold refresh is made
- Add some tweak to the database schemas
- little performance enhancement
- Update Documentation process.env

## 0.8.12

- Upgrade Database logic and error handling
- Added some useful type for extracting types from array
- some other minor changes
- count method in database!
- remove false positive error on build time
- Database union type & documentation

## 0.8.14

- Fix session header when a special character is set in a public session key or value.
- Fix session path not set correctly to the root of the page.

## 0.8.15

- Fix head data crache when a search param is set in the url
- Added DOCTYPE html for better SEO
- Fix serving assets from static that has URI encoded character

## 0.8.16

- Add revalidate multiple route

## 0.8.17

- head data is reloaded in dev mode
- env variable are now accessible in the build if it's prefix is PUBLIC\_ (new bun feature of 1.1.39)
- Fix ServerAction undefined variable not assign

## 0.8.18

- Fix Database schema union type making number as string
- Database schema in json object in array are considered union
- Database schema union in json column type can be string or/and number
- Session strategy has changed and session timeout is automatically updated
- Database LIKE operator for SELECT operation
- direct access to the database for making custom request ( this method do not provide a secure way to make database call **you must make it secure** )
- added tests for database
- automatic session timeout update UI

## 0.8.19

- enforce tests
- remove unused files in build after each builds
- Router: any [segmentName].tsx is now supported 
  - **previously**: only [id].tsx was supported
  - **now**:  any [segmentName] supported (ex: [foo].tsx or [bar].tsx)
- update README
- SVG loader use SVGR (now stable)

## 0.8.20

- caching SVG for more fluid dev experience

## 0.8.21

- update SVG caching strategy cold start improvement and cache validation based on the file hash
- new caching system for SSR Elements
  - Fix a long time bug build crash when ServerComponents List, total length, was too big
  - improve build speed
- Benchmark ( Single-Threaded & Multi-Threaded ) - README

## 0.8.22

- Fix missing regex for [segmentName]
- Fix Concurrent Read & Write of the Database
- Add utils function to make fake data
- cache is cleared for dev between version in browser

## 0.8.23

- Fix Crash in dev mode introduced in Bun version 1.1.43