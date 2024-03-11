# bunext

    - Nextjs Framwork compatible with Bun Runtime

## What is ready

    - SSR and CSR
    - layout stacking
    - React
    - Static assets
    - Server componants ("use server" & "use client")
    - Hot reload
    - Revalidate
    - Server action
    - Links
    - Session Management ( public & private )
    - SQlite Management

## What is planed

    - Hot reload (features state memory)
    - React (some tweek needed for full compatibility)
    - Documentation
    - Revalidate ( beta version )
    - Session Management ( beta version )
    - Server componants ( Cleanup and refactoring for performance and reliability )
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

```TypeScript

```

### Get Session

```TypeScript
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
