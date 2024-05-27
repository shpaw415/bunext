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

## What is planed

- Links

- Documentation

- SQlite performance & features

### To install and run

```Bash
#!/bin/env bash
bun  i  @bunpmjs/bunext  ||  bunpm  install  bunext
bun  bunext  init
bun  run  dev
```

## Documentation

## Session

Manage the session from your users by setting a session and optionaly make it accessible from the client side ( default to only Server Side ).

- SetData only from the Server Side is allowed.
- Delete Session data can be Client or Server Side
- GetData can be Client or Server Side ( but Client only have access to what is made public )

### Set Session data

```TypeScript XML
import { Session } from  "@bunpmjs/bunext/features/session";

function ServerAction({username, password}:{usename: string, password:string}) {
	Session.setData({
		username: username
	}, true); // accessed from Client side
	Session.setData({
		password: password
	}, false); // Only accessed from server side
}
```

### Get Session data

```TypeScript XML



```
