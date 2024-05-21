# Compatibility

    compatible: bun 1.1.8 & under

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
    - SQlite Management
    - Server componants
    - Devloppement mode ( beta version )
    - Production mode ( Beta )

## What is planed

    - Links
    - Hot reload (features state memory)
    - React (some tweek needed for full compatibility)
    - Documentation
    - Revalidate ( testing for edge cases )
    - SQlite performance & features

### To install and run

```Bash
#!/bin/env bash
bun i @bunpmjs/bunext || bunpm install bunext
bun bunext init
bun run dev
```

## Documentation To Come

## Session

### Set Session

```JavaScript XML

```

### Get Session

```JavaScript XML
    "use server";
    export default function Page() {

    }
    // other file
    "use client"
    import { Session } from "@bunpmjs/bunext/features/session";
    export function Componant() {
        const session = Session.getData();
        return <span>{session.username}</span>
    }

```
