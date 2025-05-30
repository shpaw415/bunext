

# 🚀 Bunext Documentation  

Bunext is a **Next.js-inspired framework** designed for the **Bun runtime**, providing high-performance SSR, CSR, static site generation, and multi-threaded HTTP workers. It is optimized for modern development workflows with built-in SQLite support, session management, and server actions.  

## 🔧 Compatibility  

- **Bun Version**: `1.1.0 - 1.2.15`  
- **Supported OS**: Linux, WSL (Windows support in progress)  
- **Note**: Bun is evolving rapidly. New versions may cause compatibility issues. Watch for breaking changes before version `1.0.0`.  

---

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/shpaw415/bunext?utm_source=oss&utm_medium=github&utm_campaign=shpaw415%2Fbunext&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

## 📦 Installation & Setup  

To install Bunext, use:  

```sh
bun i bunext-js
bun bunext init
# OR
bun create bunext-app
```  

Then initialize your project:  

```sh
bun run db:create  # Creates types and missing tables in the database  
```  

To start the development server:  

```sh
bun run dev  
```  

For production builds:  

```sh
bun run build  
bun run start  
```  

---

## 📌 Features  

✅ **Multi-threaded HTTP workers** (Linux only)  
✅ **SSR (Server-Side Rendering) & CSR (Client-Side Rendering)**  
✅ **Server & client environment variables (`process.env`)**  
✅ **React 18 & 19 support**  
✅ **Static assets & SVG support**  
✅ **Server components ("use server" & "use client")**  
✅ **Revalidation & caching**  
✅ **Session management (public & private)**  
✅ **SQLite database management**  
✅ **Hot reload in development mode**  
✅ **Production-ready mode (Beta)**

---

## 📁 Routing System  

Bunext follows **Next.js-style file-based routing**.  

- `src/pages/index.tsx` → Home Page  
- `src/pages/[id].tsx` → Dynamic route (`/page/123`)  
- `src/pages/layout.tsx` → Layout for subroutes  
- `src/pages/[segment]/[id].tsx` → Dynamic route and segments (`/user/10`)

### 📌 Example: Basic Page  

```tsx
// src/pages/index.tsx
export default function HomePage() {
  return <h1>Welcome to Bunext!</h1>;
}
```  

### 📌 Example: Dynamic Page  

```tsx
// src/pages/[id].tsx

export async function getServerSideProps() {
    //server side
  return { foo: "bar" };
}

export default function DynamicPage({ 
    params,
    props
} : {
    params: { id: string }, 
    props: { foo: string }
}) {
  return <h1>Page ID: {params.id} {props.foo}</h1>;
}
```  

---

# ⚙️ Server Components

Bunext supports **Server Components**, which run **only at build time** and are re-executed only when `revalidate()` is triggered.

---

## ✅ How It Works

- Any exported function without the `"use client"` directive is treated as a **Server Component**.
- Must have **no props**.
- Must be **exported** (not inline) and can be `async`.
- `revalidate()` will re-run **all Server Components** used on the page.
- Must not have hooks

---

### 📦 Example

```tsx
// index.tsx

export default async function Page() {
  return (
    <div>
      {await Components()}
      <NotValid />
    </div>
  );
}

// ✅ Valid Server Component
export async function Components() {
  const res = await (await fetch("https://some-api.com/api")).json();
  return <div>{JSON.stringify(res)}</div>;
}

// ❌ Invalid - has props
export function NotValid({ someProps }: { someProps: string }) {
  return <div>{someProps}</div>;
}
```
---
🧩 Nested Server Components
You can also compose Server Components by nesting them.

```tsx
// index.tsx

export default async function Page() {
  return (
    <main>
      {await Parent()}
    </main>
  );
}

export async function Parent() {
  return (
    <section>
      <h2>Parent Component</h2>
      {await Child()}
    </section>
  );
}

export async function Child() {
  const data = await (await fetch("https://some-api.com/stats")).json();
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

---
🔁 Revalidating Components
Bunext allows scheduled and manual revalidation.

⏱ Scheduled Revalidation

```tsx
// index.tsx
import { revalidate } from "bunext-js/features/router/revalidate.ts";

export default function Page() {
  revalidateEvery("/", 3600); // revalidate this page every hour

  return (
    <div>
      <button onClick={() => ServerRevalidate(["/"])}>Revalidate / path</button>
    </div>
  );
}



```
---
🔄 Manual Revalidation

```tsx
import { revalidate } from "bunext-js/features/router/revalidate.ts";

export async function ServerRevalidate(...paths: string[]) {
  revalidate(...paths);
}
```

---

📝 Rules to apply
  - ✅ Keep Server Components pure – no side effects.
  - ✅ Fetch data server-side with async/await.
  - ❌ Avoid using props.
  - ❌ Don't mutate state or use hooks like useState or useEffect.

---

## 🚀 Static Pages with `"use static"`  

You can **cache pages for better performance** using `"use static"`.  

```tsx
"use static"; // Enables static page caching

export async function getServerSideProps() {
  return { data: await fetch("https://api.example.com").then((res) => res.json()) };
}

export default function Page({ props }: { props: { data: any } }) {
  return <div>Data: {JSON.stringify(props.data)}</div>;
}
```  

Revalidate static pages after a set time:  

```tsx
"use static";

import { revalidateStatic } from "bunext-js/router";

export async function getServerSideProps({request}: {request: Request}) {
    revalidateStatic(request, 3600) // revalidate after 1 hour
  return { data: await fetch("https://api.example.com").then((res) => res.json()) };
}

export default function Page({ props }: { props: { data: any } }) {
  return <div>Data: {JSON.stringify(props.data)}</div>;
}

```  

Revalidate static pages in an Action:  

```tsx
import { revalidateStatic } from "bunext-js/router";

export async function ServerRevalidateStaticPage(path: string) {
    // path ex: /page/345 ( /page/[id] )
    revalidateStatic(path);
}

```  

---

## 🔗 Navigation  

Bunext provides two ways to navigate between pages:  

```tsx
import { navigate, Link } from "bunext-js/internal/router";

function NextPage() {
  return (
    <>
      <button onClick={() => navigate("/new/location")}>Go to New Page</button>
      <Link href="/new/location">
        <button>Next Page</button>
      </Link>
    </>
  );
}
```  

---


## API Endpoint

Define HTTP method handlers in files under `src/pages` to automatically create API endpoints.

### 📁 Example: `src/pages/api/v1/index.ts`

```ts
import type { BunextRequest } from "bunext-js/internal/server/bunextRequest.ts";

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
```

---

## 🌐 Making Requests from the Client

You can send requests to this API using the native `fetch` function:

```ts
await fetch("https://my.site.com/api/v1", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" })
});
// Response will be: "POST"
```

---

### ✅ Features
- Fully typed request with `BunextRequest`
- Auto-routing based on file path
- Clean, REST-like interface using standard HTTP verbs





## 🛠️ Sessions  

Bunext supports **server-side and client-side session management**.  

### 📌 Set Session Data (Server-Side)  

```tsx
import { GetSession } from "bunext-js/features/session";

export async function ServerSetSession({ username }) {
  const session = GetSession(arguments);
  session.setData({ username }, true); // Accessible on both client & server
}
```  

### 📌 Access Session Data (Client-Side)  

```tsx
import { useSession } from "bunext-js/features/session";

export default function UserStatus() {
  const session = useSession();
  return <span>{session.getData()?.username || "Not logged in"}</span>;
}
```  

### 📌 Delete Session  

```tsx
export async function ServerDeleteSession() {
  GetSession(arguments).delete();
}
```  

---

## 🔄 Server Actions  

Bunext supports **Server Actions** for secure API calls.  

 - function name must start with the keyword Server 
 - **File & File[]** must be at the first level of params.
 - formData is supported without other params
 - params must be serializable 

```tsx
export async function ServerUploadFile(file: File, data: string) {
  await Bun.write(`uploads/${file.name}`, file);
  console.log(data);
  return { success: true, message: "File uploaded!" };
}
```  

Call this function from a client component:  

```tsx
<form action={async (e) => await ServerUploadFile(e.get("file") as File, "picutre") }>
  <input type="file" name="file" />
  <button type="submit">Upload</button>
</form>
```  

---

## 🗃️ Database Integration (SQLite)  

### 📌 Define Schema  

```ts
import { DBSchema } from "bunext-js/database/schema";

const schema: DBSchema = [
  {
    name: "Users",
    columns: [
      { name: "id", type: "number", unique: true, primary: true, autoIncrement: true },
      { name: "username", type: "string", unique: true },
      { name: "role", type: "string", union: ["admin", "user"] },
    ],
  },
];

export default schema;
```  

Run the migration:  

```sh
bun run db:create
```  

### 📌 Query Database  

```tsx
import { Database } from "bunext-js/database";

const db = Database();
const users = db.Users.select({ where: { role: "admin" } });
```  

---

## 🔧 Environment Variables  

- `PUBLIC_API_KEY="123456"` → **Accessible in client & server**  
- `API_KEY="private-key"` → **Only accessible in server**  

Use in code:  

```tsx
console.log(process.env.PUBLIC_API_KEY); // Available in client
console.log(process.env.API_KEY); // Server-only
```  

---


##  Dynamic import module
**Experimental**

Import module from directory you don't want to explicitly add to your code.
Exemple: templates, you does not want to import every of them, 


### Config
In config/server.ts add 
```ts
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
  },
  Dev: {
    hotServerPort: 3005,
  },
  session: {
    type: "database:hard",
  },
  router: {
    dynamicPaths: ["src/dynamic"], // base paths of dynamic components
  },
};
```

### Usage
```tsx
"use client";

export function getServerSideProps() {
  // make a Glob of files or get from the Database
  return {
    template_name: "component_1"
  }
}

export default async function DynamicImport({props}:{props: {template_name: string}}) {
  return (
    <Bunext.plugins.onRequest.components.DynamicComponent
      pathName={`/src/dynamic/${props.template_name}`}
      elementName="default"
      props={{ title: "foo-bar" }}
    />
  );
}


// /src/dynamic/:template_name

export default function DynamicComponent({ title }: { title: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <h1>Dynamic Component</h1>
      <p>This component is loaded dynamically.</p>
    </div>
  );
}



```


## 📊 Benchmarks  

Bunext is optimized for **speed** and **efficiency**.  

### 🖥️ Single-Threaded Performance  

![Single-Threaded](https://raw.githubusercontent.com/shpaw415/bunext/main/benchmark/0.9.5/wrk-benchmark-single-threaded.png)  

### 🔥 Multi-Threaded (12 Threads)  

![Multi-Threaded](https://raw.githubusercontent.com/shpaw415/bunext/main/benchmark/0.9.5/wrk-benchamrk-multi-threaded.png)  

---

## 📝 Contributing  

Contributions are welcome! Submit issues and PRs on [GitHub](https://github.com/shpaw415/bunext).  

## 📜 License  

Bunext is open-source under the **MIT License**.  

---

This version improves readability, adds more examples, and organizes the content better. Let me know if you want any changes! 🚀


## 📌 Changelog  

  <summary>🔹 0.8.x Versions</summary>

  <details>
    <summary>📢 0.8.18</summary>

  - Fix Database schema union type making number as string  
  - Database schema in JSON objects in arrays are considered unions  
  - Database schema union in JSON column type can be string or/and number  
  - Session strategy has changed and session timeout is automatically updated  
  - Database `LIKE` operator for `SELECT` operation  
  - Direct access to the database for making custom requests (**must be secured manually**)  
  - Added tests for database  
  - Automatic session timeout update UI  


  <details>
    <summary>📢 0.8.19</summary>

  - Enforce tests  
  - Remove unused files in build after each build  
  - Router: `[segmentName].tsx` is now supported  
    - **Previously**: Only `[id].tsx` was supported  
    - **Now**: Any `[segmentName]` is supported (e.g., `[foo].tsx`, `[bar].tsx`)  
  - Update README  
  - SVG loader now uses **SVGR (stable)**  

  </details>

  <details>
    <summary>📢 0.8.20</summary>

  - Caching SVG for a more fluid development experience  

  </details>

  <details>
    <summary>📢 0.8.21</summary>

  - Update SVG caching strategy for **cold start improvement** and **cache validation based on file hash**  
  - New caching system for SSR Elements  
    - Fix a long-time bug where builds crashed when Server Components list was too large  
    - Improve build speed  
  - Added **Single-Threaded & Multi-Threaded Benchmarks** in README  

  </details>

  <details>
    <summary>📢 0.8.22</summary>

  - Fix missing regex for `[segmentName]`  
  - Fix **Concurrent Read & Write of the Database**  
  - Add utility functions to generate fake data  
  - Cache is cleared in the browser between dev versions  

  </details>

  <details>
    <summary>📢 0.8.23</summary>

  - Fix **crash in dev mode** introduced in Bun version `1.1.43`  

  </details>

  <details>
    <summary>📢 0.8.24</summary>

  - Fix **crash with the dev client WebSocket**  
  - Fix **Layout not working** if inside a dynamic segment directory  

  </details>

  <details>
    <summary>📢 0.8.26</summary>

  - Fix **Layout not rendering** when inside a dynamic segment directory and the request does not use the **client-side router** (direct access)  
  - **Parallelized layout imports** to reduce cold start & dev mode loading times  

  </details>

</details>

<details>
  <summary>🔹 0.9.x Versions</summary>

  <details>
    <summary>📢 0.9.0</summary>

  - Removed unused code → **Performance upgrade**  
  - CSS is now **automatically imported** into the `<head>` component  

  </details>

  <details>
    <summary>📢 0.9.2</summary>

  - Fix **Session not updating** when modified outside an event  
  - Fix all **TypeScript errors**  
  - Fix **false errors when compiling in dev mode** with SSR component caching  
  - Dynamically update `<Head>` with `useHead`  
  - Added explicit exports → **Projects may need to update imports**  
  - `Head` data can be dynamic. Request object is parsed as props to the page element (`default export of index.tsx`)  
  - Direct access to the `request` object from any component running on the server  
  - Dev builds are now **more verbose and cleaner**  

  </details>

  <details>
    <summary>📢 0.9.3</summary>

  - Fix **CSS auto-imports for dynamic segments**  
  - Auto-imported CSS is rendered at first load, suppressing flickering on direct access or first load  

  </details>

  <details>
    <summary>📢 0.9.4</summary>

  - Fix **CSS not imported on direct access** for CSS inside a `Page` element (worked for layouts)  
  - SVG and CSS files are now **typed correctly**  
  - **NEW FEATURE:** `"use static"` directive  
    - Caches pages for specific paths (even with dynamic segments)  
    - Example: `/a/path/[id]` caches `/a/path/1` and `/a/path/2`  
    - Can be revalidated  
  - Router **code cleaned**  
  - **Stronger fetch caching**  

  </details>

  <details>
    <summary>📢 0.9.6</summary>

  - `"use static"` **performance upgrade**  
  - Routes exporting `default` verified as SSR elements are **now cached properly**  
    - **80%+ performance boost** (significantly reduces server load)  
  - New **0.8.x vs 0.9.5 benchmark**  
  - Fix **"use static" not caching** for dynamic segments  
  - Dynamic pages now have a **100% performance upgrade** (no joke)  
  - `"use static"` **benchmark added**  

  </details>

  <details>
    <summary>📢 0.9.7</summary>

  - Fix **`getServerSideProps` breaking** when returning `undefined`  
  - Fix update issue where it **overwrites existing React & React-DOM**  
  - Default React & React-DOM versions updated to **`19.0.0`**  

  </details>

  <details>
    <summary>📢 0.9.8</summary>

  - **Override session expiration** using `session.setExpiration()`  
  - Fix **params not reaching `getServerSideProps`**  

  </details>

  <details>
    <summary>📢 0.9.10</summary>

  - Added more **tests to prevent previous errors from recurring**  
  - Fix **`getServerSideProps` breaking request** when `undefined` on route change/refresh in dev mode  
  - **Faster development mode** reducing build time exponentially  

  </details>

  <details>
    <summary>📢 0.9.16</summary>

    - Fix Dev mode Reloading page on every file modification.
    - adding code rabbit review
    - Fix page wasn't reloading after a file change if it wasn't the index or layout
  </details>

  <details>
    <summary>📢 0.9.17</summary>
    
    - Redirection is now possible in a ServerAction 
    - Fix regression API Endpoint cannot be reach introduced in 0.9.10
  </details>

   <details>
    <summary>📢 0.9.18</summary>
    
    - New Global object Bunext for every Bunext features
    - Dynamic Module loading feature. ( Load Module without knowing the name at first ). Exemple will follow + tooling, components
    - HTTPServer options can be set from the config file config/server.ts
  </details>
</details>

<details>
<summary>🔹0.10.x</summary>
<details>
    <summary>📢 0.10.1</summary>
    
    - Update Global Bunext object
    - Refactor many components
    - dynamic components method change ( only needs to add the server config )
    - cleanup code for readability and maintainability
  </details>
  <details>
    <summary>📢 0.10.3</summary>

    - Fix regression introduced in 0.9.18 where the onRequest file was not imported correctly
    - much more verbose CLI outputs and automatic benchmarking
  </details>
  <details>
    <summary>📢 0.10.4</summary>

    - Add a plugin system for altering the life cycle of the build, request and routing process
    - Bunext global object updated
  </details>
</details>


<details>
<summary>🔹0.11.x</summary>
<details>
    <summary>📢 0.11.1</summary>
    
    - Build process worker thread (improve build time by removing the overhead of triggering a new process each time) 
  </details>

  <details>
    <summary>📢 0.11.3</summary>
    
    - Upgraded Version of Link element now is a Anchor element and ctrl+click will open in a new tab.
    - Link and navigate has typeSafe route path
    - BunextPlugin has onFileSystemChange new key (doc will follow)
    - update Doc for missing section API endpoints and server components
    - Head component for setting dynamic head data
  </details>

  <details>
    <summary>📢 0.11.4</summary>
    
    - Fix minor init type
    - Upgrade typed Route paths
    - other minor improvement
  </details>

  <details>
    <summary>📢 0.11.5</summary>
    
    - Fix useSession hook not updating properly after a ServerAction modify the session.
    - fix typo in CLI
    - remove unnecessary getSession props
    - fix dev mode serverAction and serverComponents not transpiling correctly
  </details>

  <details>
    <summary>📢 0.11.6</summary>
    
    - fix cli missing NODE_ENV
    - add chrome dev tool protocol for workspace
    - refactored server-actions and server-components, moved in a plugin format
  </details>

</details>

