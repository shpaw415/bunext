# Compatibility

compatible: bun 1.1.10 & under

N.B : Bun is in continuous changement and compatibility between version is a

huge problem for Bunext there is possible crash over some new version i will

keep up to date the framework for what it needs

# bunext

- Nextjs Framwork compatible with Bun Runtime

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

- Links

## What is planed

- Documentation

- SQlite performance & features
- .ts extention for serverAction ( only .tsx is allowed for now )

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

```TypeScript XML
import { Session, useSession } from  "@bunpmjs/bunext/features/session";

export default function Page() {
	return <div>
		<LoggedIndicator/>
		<SetSession />
	</div>
}

function SetSession() {
	const session = useSession({
		PreventRenderOnUpdate: true,
	});
	return 	<button onClick={async () => {
				await ServerSetSession({
					username: "foo",
					password: "bar"
				});
				session.update();
				/*
					Will update every React Element using useSession
					without PreventRenderOnUpdate
				*/
	}>
		Click to update Session
	</button>
}

function LoggedIndicator() {
	const session = useSession();
	return <span>{session.getData()?.username || "not logged"}</span>
}

export async function ServerSetSession({
	username,
	password
}:{
	usename: string,
	password:string
}) {
	Session.setData({
		username: username
	}, true); // accessed from Client & Server Side
	Session.setData({
		password: password
	}, false); // Only accessed from Server Side
}
```

### Get Session data

```TypeScript XML
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

```TypeScript XML
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
	return (
		<button onClick={() => session.delete()}>
			Click to delete the session
		</button>
	);
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

- As long there is no **"use client"** on top of the file the serverAction will be Server Side
- Server Action name should always start with **Server** key word
- Server Action must be **exported async function**
- It can be called like a normal async function from the client side
- File must be on the **first level of params** you cannot put a file in an object
- File extension must be .tsx

```TypeScript XML
// index.tsx
export default function FormPage() {
	return (
		<form onSubmit={async (e) => {
			e.preventDefault();
			const form = new FormData(e.currentTarget);
			await ServerUploadFile(
				{
					username:  form.get("username") as string,
					password:  form.get("password") as string,
				},
				form.get("file") as File
			);

}}>
			<input type="file" name="file"/>
			<input type="text" placeholder="username" name="username"/>
			<input type="text" placeholder="password" name="password"/>
			<button type="submit">Send</button>
		</form>
	);
}

export async function ServerUploadFile({
		username,
		password
	}:{
		username:string,
		password:string
	},
	file: File
) {
	// do stuff
}
```

### Server Componants

Bunext offer a Server Componants ability that is managed with revalidate.
Will run only once at build time and when revalidate is ran.

- unless **"use client"** directive is set, exported function will be verify as a server Componant.
- Must be empty props.
- **Must be exported** and can be async as well.
- revalidate will invalidate every componants that are in the page.

```TypeScript XML
// index.tsx

export default function Page() {
	return (
		<div>
			<Componants />
			<NotValid />
		</div>
	);
}
// valid Server Componant
export function Componants() {
	const res = (await fetch("https://some-api.com/api")).json();
	return <div>{JSON.stringify(res)}</div>
}

// not valid Server Componant
export function NotValid({someProps}:{someProps: string}) {
	return <div></div>
}
```
