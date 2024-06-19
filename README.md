# Compatibility

compatible: bun 1.1.13 & under
compatible OS: Linux, WSL

N.B : Bun is in continuous changement and compatibility between version is a

huge problem for Bunext there is possible crash over some new version i will

keep up to date the framework for what it needs

# bunext

- Nextjs Framwork compatible with Bun Runtime

- Facing problemes? [Open an issue ](https://github.com/shpaw415/bunext/issues)

## Updating to a new Version

When an update of Bunext is made you must run:

```Bash
#!/usr/bin/env bash
bun run init
bun run databaseCreate # only create the types
```

## What is ready

- SSR and CSR

- layout stacking

- React

- Static assets

- Server componants ("use server" & "use client")

- Hot reload

- Revalidate ( beta version )

- Server action ( File can be uploaded )

- Session Management ( public & private )

- SQlite Management ( Beta )

- Server componants

- Devloppement mode with Hot Reload ( beta version )

- Production mode ( Beta )

## What is planed

- Documentation

- SQlite performance & features

- .ts extention for serverAction ( only .tsx is allowed for now )

- FormData support for Server Action

- Links

### To install and run

```Bash
#!/bin/env bash
bun i @bunpmjs/bunext || bunpm install bunext
bun bunext init
bun run dev
```

## Documentation

## Session

Manage the session from your users by setting a session and optionaly make it accessible from the client side ( default to only Server Side ).

- SetData only from the Server Side is allowed.
- Delete Session data can be Client or Server Side
- GetData can be Client or Server Side ( but Client only have access to what is made public )

- **useSession**
  - will automaticaly update the element when the session is updated

### Set Session data

```JavaScript XML
import { Session, useSession } from "@bunpmjs/bunext/features/session";

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
  return <span>{session.getData()?.username || "not logged"}</span>;
}

export async function ServerSetSession({
  username,
  password,
}: {
  usename: string;
  password: string;
}) {
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
import { useSession, Session } from  "@bunpmjs/bunext/features/session";
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
	Session.delete();
	return "Session has been deleted by the server"
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
- File extension must be .tsx

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
  const res = (await fetch("https://some-api.com/api")).json();
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
bun run databaseCreate
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
  const db = await Database();

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

this method is temporary a new version will be avalable in a new release

```Javascript XML
// index.tsx
import { navigate } from "@bunpmjs/bunext/internal/router";
function NextPage() {
  return <button onClick={() => navigate("/new/location")}>Next page</button>;
}

```

## Set Head meta data

- Head will be set for the current page
- set _path_ to set data for another path
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

## Api Endpoint

- access the Endpoint via src/pages as root

```TypeScript
// /src/pages/api/v1/index.ts
export async function POST(request: Request) {
  return new Response("You made a POST request");
}
export async function GET(request: Response) {
  return new Response("You made a GET request");
}
export async function DELETE(request: Response) {
  return new Response("You made a DELETE request");
}
export async function PUT(request: Response) {
  return new Response("You made a PUT request");
}

// Client request
await fetch("my.site.com/api/v1", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" })
}); // return the post data
```
