

# 🚀 Bunext

> **High-performance Next.js-inspired framework for the Bun runtime**

[![Version](https://img.shields.io/npm/v/bunext-js?color=success&label=version)](https://www.npmjs.com/package/bunext-js)
[![CodeRabbit Reviews](https://img.shields.io/coderabbit/prs/github/shpaw415/bunext?utm_source=oss&utm_medium=github&utm_campaign=shpaw415%2Fbunext&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)

Bunext is a **modern full-stack framework** built specifically for the **Bun runtime**, delivering blazing-fast performance with familiar Next.js patterns. Features include SSR/CSR, multi-threaded HTTP workers, built-in SQLite database, session management, and server actions - all optimized for modern development workflows.

## ✨ Key Features

- 🚀 **Lightning Fast**: Multi-threaded HTTP workers (Linux)
- 🔄 **Universal Rendering**: SSR, CSR, and Static Site Generation
- 🗄️ **Built-in Database**: Type-safe SQLite with automatic migrations
- 🔐 **Session Management**: Secure client/server session handling
- ⚡ **Server Actions**: Type-safe server functions
- 📁 **File-based Routing**: Next.js-style routing system
- 🎨 **Modern DX**: Hot reload, TypeScript, and React 18/19 support
- 🔧 **Plugin System**: Extensible architecture

## 🔧 Compatibility

| Component | Version | Status |
|-----------|---------|--------|
| **Bun** | `1.1.0 - 1.2.19` | ✅ Supported |
| **Node.js** | N/A | ❌ Use Bun runtime |
| **OS** | Linux, WSL | ✅ Supported |
| **OS** | Windows | 🚧 In Progress |
| **React** | `18.x - 19.x` | ✅ Supported |

> **⚠️ Note**: Bun is evolving rapidly. New versions may introduce breaking changes before `1.0.0`.

## ⚡ Quick Start

### Installation

Choose your preferred installation method:

```bash
# Method 1: Install and initialize
bun i bunext-js
bun bunext init

# Method 2: Create new project
bun create bunext-app my-bunext-app
cd my-bunext-app
```

### Setup Database

Initialize your database and generate types:

```bash
bun run db:create  # Creates types and missing tables
```

### Development

Start the development server with hot reload:

```bash
bun run dev
```

### Production

Build and deploy your application:

```bash
bun run build  # Build for production
bun run start  # Start production server
```

## 🏗️ Project Structure

```
my-bunext-app/
├── src/
│   ├── pages/           # File-based routing
│   │   ├── index.tsx    # Home page (/)
│   │   ├── [id].tsx     # Dynamic route (/123)
│   │   └── api/         # API endpoints
│   └── components/      # Reusable components
├── config/
│   ├── server.ts        # Server configuration
│   └── database.ts      # Database schema
├── static/              # Static assets
└── package.json
```

## 📁 Routing System

Bunext uses **file-based routing** similar to Next.js, making navigation intuitive and organized.

### Route Patterns

| File Path | Route | Description |
|-----------|-------|-------------|
| `src/pages/index.tsx` | `/` | Home page |
| `src/pages/about.tsx` | `/about` | Static route |
| `src/pages/[id].tsx` | `/123` | Dynamic route |
| `src/pages/user/[id].tsx` | `/user/123` | Nested dynamic route |
| `src/pages/[...slug].tsx` | `/a/b/c` | Catch-all route |
| `src/pages/layout.tsx` | - | Layout component |

### Basic Page Example

```tsx
// src/pages/index.tsx
export default function HomePage() {
  return (
    <div>
      <h1>Welcome to Bunext!</h1>
      <p>A high-performance framework for Bun runtime</p>
    </div>
  );
}
```

### Dynamic Route with Server-Side Props

```tsx
// src/pages/user/[id].tsx
export async function getServerSideProps({ params }: { params: { id: string } }) {
  // Fetch data on the server
  const user = await fetchUser(params.id);
  return { user };
}

export default function UserPage({ 
  params, 
  props 
}: { 
  params: { id: string };
  props: { user: User };
}) {
  return (
    <div>
      <h1>User Profile: {props.user.name}</h1>
      <p>User ID: {params.id}</p>
    </div>
  );
}
```

### Navigation

Navigate between pages using the built-in router:

```tsx
import { navigate } from "bunext-js/router/navigate";
import { Link } from "bunext-js/link";

function Navigation() {
  return (
    <nav>
      {/* Programmatic navigation */}
      <button onClick={() => navigate("/about")}>
        Go to About
      </button>
      
      {/* Declarative navigation */}
      <Link href="/user/123">
        <span>View User Profile</span>
      </Link>
    </nav>
  );
}
```

## ⚙️ Server Components

Bunext supports **Server Components** that run at build time and can be revalidated on demand.

### How Server Components Work

- **Server-only execution**: Run only at build time or when revalidated
- **No props allowed**: Must be parameter-free functions
- **Must be exported**: Cannot be inline components
- **Async support**: Can use `async/await` for data fetching
- **No React hooks**: Cannot use `useState`, `useEffect`, etc.

### Basic Server Component

```tsx
// src/pages/dashboard.tsx
export default async function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      {await StatsComponent()}
      {await RecentActivity()}
    </main>
  );
}

// ✅ Valid Server Component
export async function StatsComponent() {
  const stats = await fetch("https://api.example.com/stats")
    .then(res => res.json());
  
  return (
    <div className="stats">
      <h2>Statistics</h2>
      <pre>{JSON.stringify(stats, null, 2)}</pre>
    </div>
  );
}

// ✅ Valid Server Component
export async function RecentActivity() {
  const activities = await fetchRecentActivities();
  
  return (
    <section>
      <h2>Recent Activity</h2>
      {activities.map(activity => (
        <div key={activity.id}>{activity.description}</div>
      ))}
    </section>
  );
}
```

### Nested Server Components

Server Components can be composed and nested:

```tsx
export default async function BlogPage() {
  return (
    <main>
      {await BlogHeader()}
      {await BlogContent()}
    </main>
  );
}

export async function BlogHeader() {
  const siteInfo = await fetchSiteInfo();
  return (
    <header>
      <h1>{siteInfo.title}</h1>
      {await NavigationMenu()}
    </header>
  );
}

export async function NavigationMenu() {
  const menuItems = await fetchMenuItems();
  return (
    <nav>
      {menuItems.map(item => (
        <a key={item.slug} href={item.href}>{item.title}</a>
      ))}
    </nav>
  );
}

export async function BlogContent() {
  const posts = await fetchLatestPosts();
  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </div>
  );
}
```

### Revalidation

#### Scheduled Revalidation

```tsx
import { revalidateEvery } from "bunext-js/router/revalidate";

export default function HomePage() {
  // Revalidate this page every hour
  revalidateEvery("/", 3600);
  
  return (
    <div>
      <h1>Home Page</h1>
      {await TimeStamp()}
    </div>
  );
}

export async function TimeStamp() {
  return <p>Generated at: {new Date().toISOString()}</p>;
}
```

#### Manual Revalidation

```tsx
import { revalidate } from "bunext-js/router/revalidate";

export async function ServerRevalidatePage(...paths: string[]) {
  revalidate(...paths);
}

// Usage in component
function AdminPanel() {
  return (
    <button onClick={() => ServerRevalidatePage(["/", "/dashboard"])}>
      Refresh Content
    </button>
  );
}
```

### Best Practices

| ✅ Do | ❌ Don't |
|-------|----------|
| Keep components pure | Use side effects |
| Use async/await for data fetching | Pass props to server components |
| Export server components | Use React hooks |
| Cache expensive operations | Mutate global state |

## 🚀 Static Pages & Caching

Optimize your application performance with static page generation and intelligent caching.

### Static Page Generation

Use the `"use static"` directive to cache pages for improved performance:

```tsx
"use static"; // Enable static page caching

export async function getServerSideProps() {
  const data = await fetch("https://api.example.com/products")
    .then(res => res.json());
  
  return { products: data };
}

export default function ProductsPage({ props }: { props: { products: Product[] } }) {
  return (
    <div>
      <h1>Our Products</h1>
      <div className="grid">
        {props.products.map(product => (
          <div key={product.id} className="card">
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <span>${product.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Time-based Revalidation

Set automatic revalidation intervals for dynamic content:

```tsx
"use static";

import { revalidateStatic } from "bunext-js/router/revalidate";

export async function getServerSideProps({ request }: { request: Request }) {
  // Revalidate every hour (3600 seconds)
  revalidateStatic(request, 3600);
  
  const news = await fetch("https://api.news.com/latest")
    .then(res => res.json());
  
  return { articles: news };
}

export default function NewsPage({ props }: { props: { articles: Article[] } }) {
  return (
    <div>
      <h1>Latest News</h1>
      <p>Updated automatically every hour</p>
      {props.articles.map(article => (
        <article key={article.id}>
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <time>{new Date(article.publishedAt).toLocaleDateString()}</time>
        </article>
      ))}
    </div>
  );
}
```

### Manual Revalidation

Trigger revalidation programmatically from server actions:

```tsx
import { revalidateStatic } from "bunext-js/router/revalidate";

export async function ServerRefreshContent(path: string) {
  // Revalidate specific static page
  // Example: path = "/products/123" for dynamic route /products/[id]
  revalidateStatic(path);
  
  return { success: true, message: `Revalidated ${path}` };
}

// Usage in component
function AdminControls() {
  return (
    <div>
      <button onClick={() => ServerRefreshContent("/products")}>
        Refresh Products
      </button>
      <button onClick={() => ServerRefreshContent("/news")}>
        Refresh News
      </button>
    </div>
  );
}
```

### Caching Strategy

| Cache Type | Use Case | Revalidation |
|------------|----------|--------------|
| **Static** | Rarely changing content | Manual or scheduled |
| **ISR** | Semi-dynamic content | Time-based intervals |
| **SSR** | Highly dynamic content | No caching |
| **Client** | User-specific data | Client-side only |

## 🌐 API Routes

Create powerful REST APIs with automatic routing and full TypeScript support.

### Basic API Route

Create API endpoints by exporting HTTP method handlers:

```typescript
// src/pages/api/users/index.ts
import type { BunextRequest } from "bunext-js/request";

export function GET(request: BunextRequest) {
  const users = [
    { id: 1, name: "John Doe", email: "john@example.com" },
    { id: 2, name: "Jane Smith", email: "jane@example.com" }
  ];
  
  request.response = new Response(JSON.stringify(users), {
    headers: { "Content-Type": "application/json" }
  });
  
  return request;
}

export function POST(request: BunextRequest) {
  // Handle user creation
  const userData = request.body;
  
  // Validate and create user
  const newUser = createUser(userData);
  
  request.response = new Response(JSON.stringify(newUser), {
    status: 201,
    headers: { "Content-Type": "application/json" }
  });
  
  return request;
}

export function PUT(request: BunextRequest) {
  // Handle user updates
  request.response = new Response("User updated");
  return request;
}

export function DELETE(request: BunextRequest) {
  // Handle user deletion
  request.response = new Response("User deleted");
  return request;
}
```

### Dynamic API Routes

Handle dynamic parameters in your API routes:

```typescript
// src/pages/api/users/[id].ts
import type { BunextRequest } from "bunext-js/request";

export function GET(request: BunextRequest) {
  const { id } = request.params;
  const user = getUserById(id);
  
  if (!user) {
    request.response = new Response("User not found", { status: 404 });
    return request;
  }
  
  request.response = new Response(JSON.stringify(user), {
    headers: { "Content-Type": "application/json" }
  });
  
  return request;
}

export function PATCH(request: BunextRequest) {
  const { id } = request.params;
  const updates = request.body;
  
  const updatedUser = updateUser(id, updates);
  
  request.response = new Response(JSON.stringify(updatedUser), {
    headers: { "Content-Type": "application/json" }
  });
  
  return request;
}
```

### Making API Requests

Call your API endpoints from the client:

```tsx
// Client-side usage
async function fetchUsers() {
  const response = await fetch("/api/users");
  const users = await response.json();
  return users;
}

async function createUser(userData: CreateUserRequest) {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });
  
  if (!response.ok) {
    throw new Error("Failed to create user");
  }
  
  return response.json();
}

async function updateUser(id: string, updates: UpdateUserRequest) {
  const response = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  
  return response.json();
}
```

### API Features

| Feature | Description | Example |
|---------|-------------|---------|
| **Auto-routing** | File path becomes API endpoint | `api/users/[id].ts` → `/api/users/123` |
| **HTTP Methods** | Support for GET, POST, PUT, PATCH, DELETE | `export function POST(request) {}` |
| **Type Safety** | Full TypeScript support with `BunextRequest` | Import and use typed request object |
| **Dynamic Routes** | Support for parameters and catch-all routes | `[id].ts`, `[...slug].ts` |
| **Middleware** | Built-in request/response processing | Access to headers, body, params |





## 🛠️ Session Management

Secure and efficient session handling for both server and client-side operations.

### Server-Side Session Management

Set and manage session data on the server:

```tsx
import { GetSession } from "bunext-js/session";

// Set session data (server action)
export async function ServerLogin(credentials: LoginCredentials) {
  
  const user = await authenticateUser(credentials);
  
  if (user) {
    const session = GetSession(arguments);
    
    // Set session data accessible on both client and server
    session.setData({ 
      userId: user.id,
      username: user.username,
      role: user.role 
    }, true);
    
    return { success: true, user };
  }
  
  return { success: false, error: "Invalid credentials" };
}

// Update session data
export async function ServerUpdateProfile(profileData: ProfileData) {
  
  const session = GetSession(arguments);
  const currentData = session.getData();
  
  // Merge with existing session data
  session.setData({
    ...currentData,
    profile: profileData,
    lastUpdated: new Date().toISOString()
  }, true);
  
  return { success: true };
}

// Delete session
export async function ServerLogout() {
  
  const session = GetSession(arguments);
  session.delete();
  
  return { success: true };
}
```

### Client-Side Session Access

Access session data in your React components:

```tsx
import { useSession } from "bunext-js/session";

export default function UserProfile() {
  const session = useSession();
  const userData = session.getData();
  
  if (!userData) {
    return <div>Please log in to continue</div>;
  }
  
  return (
    <div className="profile">
      <h1>Welcome, {userData.username}!</h1>
      <p>Role: {userData.role}</p>
      <p>User ID: {userData.userId}</p>
      
      {userData.profile && (
        <div>
          <h2>Profile Information</h2>
          <p>Email: {userData.profile.email}</p>
          <p>Last Updated: {userData.lastUpdated}</p>
        </div>
      )}
      
      <button onClick={() => ServerLogout()}>
        Logout
      </button>
    </div>
  );
}
```

### Session Configuration

Configure session behavior in your server config:

```typescript
// config/server.ts
import type { ServerConfig } from "bunext-js";

const Config: ServerConfig = {
  session: {
    type: "database:hard", // or "memory", "database:soft"
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    secure: true, // HTTPS only in production
    sameSite: "strict",
  },
  // ... other config
};

export default Config;
```

### Advanced Session Features

#### Custom Session Expiration

```tsx
export async function ServerExtendSession() {
  
  const session = GetSession(arguments);
  
  // Extend session by 2 hours
  session.setExpiration(Date.now() + (2 * 60 * 60 * 1000));
  
  return { success: true };
}
```

#### Conditional Session Data

```tsx
import { useSession } from "bunext-js/session";

function AdminPanel() {
  const session = useSession();
  const userData = session.getData();
  
  // Only show admin panel if user has admin role
  if (userData?.role !== "admin") {
    return <div>Access denied</div>;
  }
  
  return (
    <div className="admin-panel">
      <h2>Admin Dashboard</h2>
      {/* Admin-only content */}
    </div>
  );
}
```

### Session Security

| Feature | Description | Implementation |
|---------|-------------|----------------|
| **Secure Cookies** | HTTPS-only transmission | `secure: true` in config |
| **SameSite Protection** | CSRF protection | `sameSite: "strict"` |
| **Automatic Expiration** | Configurable session timeout | `maxAge` setting |
| **Server-Side Validation** | Session verification on each request | Built-in middleware |

## 🔄 Server Actions

Type-safe server functions that can be called directly from client components.

### Basic Server Actions

Server actions must follow specific naming and parameter conventions:

```tsx
// File upload server action
export async function ServerUploadFile(file: File, metadata: string) {
  
  // Validate file
  if (!file || file.size > 10 * 1024 * 1024) { // 10MB limit
    return { success: false, error: "Invalid file or file too large" };
  }
  
  // Save file
  const filename = `uploads/${Date.now()}-${file.name}`;
  await Bun.write(filename, file);
  
  // Log metadata
  console.log("File metadata:", metadata);
  
  return { 
    success: true, 
    message: "File uploaded successfully",
    filename 
  };
}

// Data processing server action
export async function ServerProcessData(data: ProcessingRequest) {
  
  try {
    // Validate input
    if (!data.items || data.items.length === 0) {
      return { success: false, error: "No items to process" };
    }
    
    // Process data
    const results = await processItems(data.items);
    
    // Save to database
    await saveProcessingResults(results);
    
    return { 
      success: true, 
      processedCount: results.length,
      results 
    };
    
  } catch (error) {
    console.error("Processing error:", error);
    return { 
      success: false, 
      error: "Processing failed" 
    };
  }
}
```

### Form Actions

Use server actions with HTML forms:

```tsx
// Server action for form handling
export async function ServerCreatePost(title: string, content: string, tags: string[]) {
  
  // Validate input
  if (!title.trim() || !content.trim()) {
    return { success: false, error: "Title and content are required" };
  }
  
  // Create post
  const post = await createBlogPost({
    title: title.trim(),
    content: content.trim(),
    tags: tags.filter(tag => tag.trim()),
    createdAt: new Date().toISOString()
  });
  
  return { success: true, post };
}

// Form component
function CreatePostForm() {
  const [result, setResult] = useState<any>(null);
  
  return (
    <form 
      action={async (formData) => {
        const title = formData.get("title") as string;
        const content = formData.get("content") as string;
        const tags = (formData.get("tags") as string).split(",");
        
        const result = await ServerCreatePost(title, content, tags);
        setResult(result);
      }}
    >
      <input name="title" placeholder="Post title" required />
      <textarea name="content" placeholder="Post content" required />
      <input name="tags" placeholder="Tags (comma-separated)" />
      <button type="submit">Create Post</button>
      
      {result && (
        <div className={result.success ? "success" : "error"}>
          {result.success ? "Post created!" : result.error}
        </div>
      )}
    </form>
  );
}
```

### File Upload Actions

Handle file uploads with proper validation:

```tsx
export async function ServerUploadImages(files: File[], albumId: string) {
  
  const uploadResults = [];
  
  for (const file of files) {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      uploadResults.push({
        filename: file.name,
        success: false,
        error: "Not an image file"
      });
      continue;
    }
    
    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      uploadResults.push({
        filename: file.name,
        success: false,
        error: "File too large"
      });
      continue;
    }
    
    try {
      // Generate unique filename
      const ext = file.name.split('.').pop();
      const filename = `${albumId}/${crypto.randomUUID()}.${ext}`;
      const filepath = `uploads/images/${filename}`;
      
      // Save file
      await Bun.write(filepath, file);
      
      // Save to database
      await saveImageRecord({
        albumId,
        filename,
        originalName: file.name,
        size: file.size,
        mimeType: file.type
      });
      
      uploadResults.push({
        filename: file.name,
        success: true,
        path: filepath
      });
      
    } catch (error) {
      uploadResults.push({
        filename: file.name,
        success: false,
        error: "Upload failed"
      });
    }
  }
  
  return { results: uploadResults };
}

// Multi-file upload component
function ImageUpload({ albumId }: { albumId: string }) {
  return (
    <form 
      action={async (formData) => {
        const files = formData.getAll("images") as File[];
        const result = await ServerUploadImages(files, albumId);
        
        result.results.forEach(r => {
          console.log(`${r.filename}: ${r.success ? "✓" : "✗"} ${r.error || ""}`);
        });
      }}
    >
      <input 
        type="file" 
        name="images" 
        multiple 
        accept="image/*" 
        required 
      />
      <button type="submit">Upload Images</button>
    </form>
  );
}
```

### Server Action Rules

| Rule | Description | Example |
|------|-------------|---------|
| **Naming** | Must start with "Server" | `ServerUploadFile`, `ServerProcessData` |
| **Directive** | Must include `"use server"` | First line of function |
| **File Parameters** | File/File[] must be first-level params | `(file: File, data: string)` |
| **Serializable** | All params must be serializable | No functions, classes, etc. |
| **FormData** | Supported without other params | `action={async (formData) => {}}` |

### Error Handling

```tsx
export async function ServerWithErrorHandling(data: any) {
  
  try {
    // Validate input
    if (!data) {
      throw new Error("No data provided");
    }
    
    // Process data
    const result = await processData(data);
    
    return { success: true, data: result };
    
  } catch (error) {
    // Log error for debugging
    console.error("Server action error:", error);
    
    // Return user-friendly error
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

## 🗃️ Database Integration

Type-safe SQLite database with automatic migrations and intuitive query API.

### Schema Definition

Define your database schema with full TypeScript support:

```typescript
// config/database.ts
import { DBSchema } from "bunext-js/database/schema";

const schema: DBSchema = [
  {
    name: "Users",
    columns: [
      { 
        name: "id", 
        type: "number", 
        unique: true, 
        primary: true, 
        autoIncrement: true 
      },
      { 
        name: "username", 
        type: "string", 
        unique: true,
        required: true
      },
      { 
        name: "email", 
        type: "string", 
        unique: true,
        required: true
      },
      { 
        name: "role", 
        type: "string", 
        union: ["admin", "user", "moderator"],
        default: "user"
      },
      {
        name: "profile",
        type: "json",
        required: false
      },
      {
        name: "createdAt",
        type: "string",
        default: () => new Date().toISOString()
      }
    ],
  },
  {
    name: "Posts",
    columns: [
      { name: "id", type: "number", primary: true, autoIncrement: true },
      { name: "title", type: "string", required: true },
      { name: "content", type: "string", required: true },
      { name: "authorId", type: "number", required: true },
      { name: "tags", type: "json", default: [] },
      { name: "publishedAt", type: "string" },
      { name: "createdAt", type: "string", default: () => new Date().toISOString() }
    ],
  },
  {
    name: "Comments", 
    columns: [
      { name: "id", type: "number", primary: true, autoIncrement: true },
      { name: "postId", type: "number", required: true },
      { name: "userId", type: "number", required: true },
      { name: "content", type: "string", required: true },
      { name: "createdAt", type: "string", default: () => new Date().toISOString() }
    ],
  }
];

export default schema;
```

### Database Migrations

Create and apply database migrations:

```bash
# Generate migration and TypeScript types
bun run db:create

# This will:
# 1. Create missing tables
# 2. Generate TypeScript types
# 3. Update database schema
```

### Basic Queries

Perform type-safe database operations:

```typescript
import { Database } from "bunext-js/database";

// Get database instance
const db = Database();

// SELECT queries
export async function ServerGetUsers() {
  
  // Get all users
  const allUsers = db.Users.select();
  
  // Get users with conditions
  const adminUsers = db.Users.select({ 
    where: { role: "admin" } 
  });
  
  // Get specific columns
  const usernames = db.Users.select({
    columns: ["id", "username", "email"],
    where: { role: "user" }
  });
  
  // Get single user
  const user = db.Users.selectOne({ 
    where: { id: 1 } 
  });
  
  return { allUsers, adminUsers, usernames, user };
}

// INSERT operations
export async function ServerCreateUser(userData: CreateUserRequest) {
  
  const newUser = db.Users.insert({
    username: userData.username,
    email: userData.email,
    role: userData.role || "user",
    profile: {
      firstName: userData.firstName,
      lastName: userData.lastName,
      bio: userData.bio
    }
  });
  
  return { success: true, user: newUser };
}

// UPDATE operations
export async function ServerUpdateUser(userId: number, updates: Partial<User>) {
  
  const updatedUser = db.Users.update({
    where: { id: userId },
    data: updates
  });
  
  return { success: true, user: updatedUser };
}

// DELETE operations
export async function ServerDeleteUser(userId: number) {
  
  const deleted = db.Users.delete({
    where: { id: userId }
  });
  
  return { success: true, deleted };
}
```

### Advanced Queries

Use more complex query patterns:

```typescript
export async function ServerGetPostsWithAuthors() {
  
  const db = Database();
  
  // Get posts with author information
  const posts = db.Posts.select({
    columns: [
      "id", 
      "title", 
      "content", 
      "publishedAt"
    ],
    where: { 
      publishedAt: { $not: null } 
    },
    orderBy: { publishedAt: "desc" },
    limit: 10
  });
  
  // Add author data to each post
  const postsWithAuthors = posts.map(post => {
    const author = db.Users.selectOne({
      columns: ["id", "username"],
      where: { id: post.authorId }
    });
    
    return { ...post, author };
  });
  
  return postsWithAuthors;
}

// LIKE queries for search
export async function ServerSearchUsers(searchTerm: string) {
  
  const db = Database();
  
  const users = db.Users.select({
    columns: ["id", "username", "email"],
    where: {
      $or: [
        { username: { $like: `%${searchTerm}%` } },
        { email: { $like: `%${searchTerm}%` } }
      ]
    }
  });
  
  return users;
}

// JSON column queries
export async function ServerGetUsersWithProfile() {
  
  const db = Database();
  
  const users = db.Users.select({
    where: {
      "profile.firstName": { $not: null }
    }
  });
  
  return users;
}
```

### Direct Database Access

For complex queries, access the raw database:

```typescript
export async function ServerCustomQuery() {
  
  const db = Database();
  
  // Raw SQL query (use with caution - must be secured manually)
  const result = db.raw(`
    SELECT u.username, COUNT(p.id) as post_count
    FROM Users u
    LEFT JOIN Posts p ON u.id = p.authorId
    WHERE u.role = 'user'
    GROUP BY u.id, u.username
    ORDER BY post_count DESC
    LIMIT 10
  `);
  
  return result;
}
```

### Database Features

| Feature | Description | Example |
|---------|-------------|---------|
| **Type Safety** | Auto-generated TypeScript types | Full IntelliSense support |
| **Auto Migrations** | Automatic schema updates | `bun run db:create` |
| **JSON Columns** | Native JSON support | `profile: { type: "json" }` |
| **Query Builder** | Intuitive query API | `db.Users.select({ where: {...} })` |
| **LIKE Operator** | Text search support | `{ name: { $like: "%search%" } }` |
| **Relationships** | Manual relationship handling | Join data in application code |
| **Raw Queries** | Direct SQL access | `db.raw("SELECT * FROM...")` |

### Best Practices

```typescript
// ✅ Good: Use transactions for related operations
export async function ServerCreatePostWithTags(postData: CreatePostRequest) {
  
  const db = Database();
  
  try {
    // Start transaction
    db.beginTransaction();
    
    // Create post
    const post = db.Posts.insert({
      title: postData.title,
      content: postData.content,
      authorId: postData.authorId
    });
    
    // Create tags
    for (const tagName of postData.tags) {
      db.Tags.insert({
        name: tagName,
        postId: post.id
      });
    }
    
    // Commit transaction
    db.commit();
    
    return { success: true, post };
    
  } catch (error) {
    // Rollback on error
    db.rollback();
    throw error;
  }
}

// ✅ Good: Validate data before database operations
export async function ServerCreateUserSafe(userData: any) {
  
  // Validate required fields
  if (!userData.username || !userData.email) {
    return { success: false, error: "Username and email are required" };
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userData.email)) {
    return { success: false, error: "Invalid email format" };
  }
  
  // Check for existing user
  const db = Database();
  const existingUser = db.Users.selectOne({
    where: { 
      $or: [
        { username: userData.username },
        { email: userData.email }
      ]
    }
  });
  
  if (existingUser) {
    return { success: false, error: "Username or email already exists" };
  }
  
  // Create user
  const newUser = db.Users.insert(userData);
  return { success: true, user: newUser };
}
```

## 🔧 Configuration

Configure your Bunext application for optimal performance and functionality.

### Environment Variables

Bunext supports both public and private environment variables:

```bash
# .env file

# Public variables (accessible in client and server)
PUBLIC_API_URL="https://api.example.com"
PUBLIC_APP_NAME="My Bunext App"
PUBLIC_ANALYTICS_ID="GA-123456789"

# Private variables (server-only)
DATABASE_URL="sqlite://./database.db"
JWT_SECRET="your-secret-key"
API_KEY="private-api-key"
SMTP_PASSWORD="email-password"
```

Access environment variables in your code:

```tsx
// Client-side (only PUBLIC_ variables available)
export default function ClientComponent() {
  return (
    <div>
      <h1>{process.env.PUBLIC_APP_NAME}</h1>
      <p>API URL: {process.env.PUBLIC_API_URL}</p>
      {/* process.env.API_KEY is undefined here */}
    </div>
  );
}

// Server-side (all variables available)
export async function ServerAction() {
  
  const apiKey = process.env.API_KEY; // Available
  const publicUrl = process.env.PUBLIC_API_URL; // Available
  
  // Use private API key for server operations
  const response = await fetch("https://secure-api.com/data", {
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  
  return response.json();
}
```

### Server Configuration

Configure your server settings:

```typescript
// config/server.ts
import type { ServerConfig } from "bunext-js";

const Config: ServerConfig = {
  // HTTP Server settings
  HTTPServer: {
    port: process.env.PORT || 3010,
    hostname: "0.0.0.0",
    // Multi-threading (Linux only)
    workers: process.env.NODE_ENV === "production" ? 4 : 1,
  },
  
  // Development settings
  Dev: {
    hotServerPort: 3005,
    enableHotReload: true,
    verbose: true,
  },
  
  // Session configuration
  session: {
    type: "database:hard", // "memory", "database:soft", "database:hard"
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    cookieName: "bunext-session",
  },
  
  // Router settings
  router: {
    // Dynamic component paths
    dynamicPaths: ["src/dynamic", "src/templates"],
    
    // Static file serving
    staticPaths: ["static", "public"],
    
    // Route caching
    enableCache: true,
    cacheMaxAge: 3600, // 1 hour
  },
  
  // Database settings
  database: {
    path: "./config/bunext.sqlite",
    enableWAL: true, // Write-Ahead Logging
    busyTimeout: 5000,
  },
  
  // Build settings
  build: {
    target: "bun",
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
  },
};

export default Config;
```

### Plugin Configuration

Configure and extend Bunext with plugins in your server configuration:

```typescript
// config/server.ts
import type { ServerConfig } from "bunext-js";
import type { BunextPlugin } from "bunext-js/plugins";

// Import your custom plugins
import { analyticsPlugin } from "../plugins/analytics";
import { seoPlugin } from "../plugins/seo";

const Config: ServerConfig = {
  HTTPServer: {
    port: 3000,
  },
  
  // Register plugins
  plugins: [
    analyticsPlugin,
    seoPlugin,
    
    // Inline plugin definition
    {
      priority: 5,
      serverStart: {
        main() {
          console.log("🔧 Custom plugin initialized");
        }
      },
      router: {
        request: async (req) => {
          // Add custom request ID
          req.requestId = Math.random().toString(36).substring(7);
          return req;
        }
      }
    },
    
    // Conditional plugins based on environment
    ...(process.env.NODE_ENV === 'development' ? [
      {
        onFileSystemChange: (filePath) => {
          if (filePath?.endsWith('.md')) {
            console.log(`📝 Documentation updated: ${filePath}`);
          }
        }
      }
    ] : []),
    
    // Security plugin for production
    ...(process.env.NODE_ENV === 'production' ? [
      {
        priority: 0, // Highest priority
        router: {
          request: async (req) => {
            // Add security headers
            req.securityMode = 'strict';
            return req;
          }
        }
      }
    ] : [])
  ]
};

export default Config;
```

#### Alternative: Separate Plugin Configuration

You can also organize plugins in a separate file:

```typescript
// config/plugins.ts  
import type { BunextPlugin } from "bunext-js/plugins";

export const plugins: BunextPlugin[] = [
  {
    priority: 0,
    serverStart: {
      main() {
        console.log("🚀 Logger plugin initialized");
      }
    },
    router: {
      request: async (req) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.pathname}`);
        return req;
      }
    }
  },
  
  {
    priority: 1,
    router: {
      html_rewrite: {
        rewrite(rewriter, req) {
          // Add security headers via HTML meta tags
          rewriter.on("head", {
            element(el) {
              el.append(`
                <meta http-equiv="X-Frame-Options" content="DENY">
                <meta http-equiv="X-Content-Type-Options" content="nosniff">
              `, { html: true });
            }
          });
        }
      }
    }
  }
];
```

```typescript
// config/server.ts
import type { ServerConfig } from "bunext-js";
import { plugins } from "./plugins";

const Config: ServerConfig = {
  HTTPServer: { port: 3000 },
  plugins
};

export default Config;
```
```

### TypeScript Configuration

Optimize TypeScript settings for Bunext:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["bun-types"],
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/pages/*": ["./src/pages/*"],
      "@/config/*": ["./config/*"]
    }
  },
  "include": [
    "src/**/*",
    "config/**/*",
    "*.ts",
    "*.tsx"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "build"
  ]
}
```

### Package Configuration

Configure your package.json for Bunext:

```json
{
  "name": "my-bunext-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "bunext dev",
    "build": "bunext build",
    "start": "bunext start",
    "db:create": "bunext db:create",
    "test": "bun test",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "bunext-js": "latest",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "bun-types": "latest",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Configuration Examples

#### Production Configuration

```typescript
// config/server.prod.ts
const ProductionConfig: ServerConfig = {
  HTTPServer: {
    port: 8080,
    workers: 8, // Use all CPU cores
  },
  session: {
    type: "database:hard",
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  router: {
    enableCache: true,
    cacheMaxAge: 24 * 60 * 60, // 24 hours
  },
  build: {
    minify: true,
    sourcemap: false,
  },
};
```

#### Development Configuration

```typescript
// config/server.dev.ts
const DevelopmentConfig: ServerConfig = {
  HTTPServer: {
    port: 3010,
    workers: 1, // Single worker for easier debugging
  },
  Dev: {
    hotServerPort: 3005,
    enableHotReload: true,
    verbose: true,
  },
  session: {
    type: "memory",
    secure: false,
  },
  build: {
    minify: false,
    sourcemap: true,
  },
};
```

## 📦 Import Guide

Bunext provides organized exports for better developer experience and cleaner imports.

### Core Imports

```typescript
// Framework essentials
import { Database } from 'bunext-js/database';
import { useSession, GetSession } from 'bunext-js/session';
import { navigate } from 'bunext-js/router/navigate';
import { Link } from 'bunext-js/link';
import { Head } from 'bunext-js/head';
import { Image } from 'bunext-js/image';
```

### Database & Schema

```typescript
// Database operations
import { Database } from 'bunext-js/database';
import { DBSchema } from 'bunext-js/database/schema';
import type { Users, Posts } from 'bunext-js/database/types';
```

### Session Management

```typescript
// Client-side session
import { useSession } from 'bunext-js/session';

// Server-side session  
import { GetSession } from 'bunext-js/session';

// Advanced session utilities
import { ServerSession } from 'bunext-js/session/server';
import { ClientSession } from 'bunext-js/session/client';
import type { SessionData } from 'bunext-js/session/types';
```

### Router & Navigation

```typescript
// Navigation functions
import { navigate, revalidate } from 'bunext-js/router/navigate';
// or
import { navigate, revalidate } from 'bunext-js/router/revalidate';

// Components
import { Link } from 'bunext-js/link';
// or  
import { Link } from 'bunext-js/router/components';

// Preloading
import { PreLoadPath } from 'bunext-js/router/preload';
```

### Plugin Development

```typescript
// Plugin types
import type { BunextPlugin } from 'bunext-js/plugins';

// Built-in plugins (for reference)
import { ImagePlugin } from 'bunext-js/plugins/image';
import { SVGPlugin } from 'bunext-js/plugins/svg';
```

### Request Handling

```typescript
// API routes and server actions
import type { BunextRequest } from 'bunext-js/request';

// Request utilities
import { useRequest } from 'bunext-js/request/hooks';
import type { RequestTypes } from 'bunext-js/request/types';
```

### Utilities & Caching

```typescript
// General utilities
import { generateRandomString } from 'bunext-js/utils';

// Caching system
import { CacheManager } from 'bunext-js/cache';
import { CachedFetch } from 'bunext-js/cache/fetch';
```

### Migration from Old Imports

If you're upgrading from earlier versions, here are the key changes:

| Old Import | New Import |
|------------|------------|
| `bunext-js/internal/router` | `bunext-js/router/navigate` + `bunext-js/link` |
| `bunext-js/features/session` | `bunext-js/session` |
| `bunext-js/internal/server/bunextRequest` | `bunext-js/request` |
| `bunext-js/features/router/revalidate` | `bunext-js/router/revalidate` |
| `bunext-js/database/database_types` | `bunext-js/database/types` |

The old imports still work for backward compatibility, but we recommend using the new organized structure for better development experience.

## 🧩 Advanced Features

### Dynamic Module Loading

Load components dynamically without explicit imports - perfect for plugin systems, templates, or modular architectures.

#### Configuration

Enable dynamic imports in your server config:

```typescript
// config/server.ts
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
  },
  router: {
    dynamicPaths: ["src/dynamic", "src/templates"], // Base paths for dynamic components
  },
};

export default Config;
```

#### Usage Example

```tsx
"use client";

// Server-side props to determine which component to load
export function getServerSideProps() {
  // This could come from database, user preferences, A/B testing, etc.
  return {
    template_name: "hero_variant_a",
    theme: "dark"
  };
}

export default async function DynamicPage({ 
  props 
}: { 
  props: { template_name: string; theme: string } 
}) {
  return (
    <div className={`theme-${props.theme}`}>
      <h1>Dynamic Component Loading</h1>
      
      {/* Load component dynamically based on props */}
      <Bunext.plugins.onRequest.components.DynamicComponent
        pathName={`/src/templates/${props.template_name}`}
        elementName="default"
        props={{ 
          title: "Welcome to Bunext",
          subtitle: "High-performance framework for Bun",
          theme: props.theme
        }}
      />
    </div>
  );
}
```

#### Template Components

Create your template components in the configured dynamic paths:

```tsx
// src/templates/hero_variant_a.tsx
export default function HeroVariantA({ 
  title, 
  subtitle, 
  theme 
}: { 
  title: string; 
  subtitle: string; 
  theme: string; 
}) {
  return (
    <section className={`hero variant-a ${theme}`}>
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-subtitle">{subtitle}</p>
        <div className="hero-actions">
          <button className="btn btn-primary">Get Started</button>
          <button className="btn btn-secondary">Learn More</button>
        </div>
      </div>
      <div className="hero-image">
        <img src="/hero-a.png" alt="Hero" />
      </div>
    </section>
  );
}
```

```tsx
// src/templates/hero_variant_b.tsx
export default function HeroVariantB({ 
  title, 
  subtitle, 
  theme 
}: { 
  title: string; 
  subtitle: string; 
  theme: string; 
}) {
  return (
    <section className={`hero variant-b ${theme}`}>
      <div className="hero-image">
        <img src="/hero-b.png" alt="Hero" />
      </div>
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-subtitle">{subtitle}</p>
        <form className="hero-form">
          <input type="email" placeholder="Enter your email" />
          <button type="submit">Subscribe</button>
        </form>
      </div>
    </section>
  );
}
```

### Plugin System

Bunext features a powerful and extensible plugin system that allows you to hook into various stages of the application lifecycle, from build-time to runtime.

#### Plugin Architecture

Plugins can hook into multiple lifecycle stages:

| Stage | Description | Use Case |
|-------|-------------|----------|
| **Build Time** | Modify build process and output | Code transformation, asset optimization |
| **Server Start** | Initialize when server starts | Database setup, external service connections |
| **Request/Response** | Intercept HTTP requests | Authentication, logging, analytics |
| **HTML Rewriting** | Modify HTML before sending to client | SEO optimization, script injection |
| **File System** | React to file changes (dev mode) | Hot reload customization, asset watching |

#### Basic Plugin Structure

```typescript
// plugins/my-plugin.ts
import type { BunextPlugin } from "bunext-js/plugins";

export const myPlugin: BunextPlugin = {
  // Plugin priority (0 = highest, higher numbers = lower priority)
  priority: 0,
  
  // Server startup hooks
  serverStart: {
    main() {
      console.log("Server starting on main thread");
    },
    cluster() {
      console.log("Server starting on worker thread");
    },
    dev() {
      console.log("Development server starting");
    }
  },
  
  // Build process hooks
  build: {
    plugin: {
      name: "my-build-plugin",
      setup(build) {
        // Custom Bun build plugin
      }
    },
    buildOptions: {
      // Additional build configuration
      minify: true
    }
  },
  
  // Request/Response handling
  router: {
    request: async (req, manager) => {
      // Modify request before processing
      console.log(`Request: ${req.method} ${req.pathname}`);
      return req;
    },
    
    html_rewrite: {
      initContext(req) {
        return { requestPath: req.pathname };
      },
      rewrite(rewriter, req, context) {
        rewriter.on("title", {
          element(el) {
            el.setInnerContent(`${context.requestPath} - My App`);
          }
        });
      },
      after(context, req) {
        console.log(`HTML rewritten for ${context.requestPath}`);
      }
    }
  },
  
  // Build lifecycle hooks
  before_build_main() {
    console.log("About to start build");
  },
  
  after_build_main() {
    console.log("Build completed on main thread");
  },
  
  after_build(artifact) {
    // Process individual build artifacts
    console.log(`Built: ${artifact.path}`);
  },
  
  // Development file watching
  onFileSystemChange(filePath) {
    if (filePath?.endsWith('.css')) {
      console.log(`CSS file changed: ${filePath}`);
    }
  },
  
  // Exclude files from build
  removeFromBuild: [
    "my-package/server-only/**",
    "dev-tools/**"
  ]
};
```

#### Real-World Plugin Examples

##### Analytics Plugin

Track page views and performance metrics:

```typescript
// plugins/analytics.ts
import type { BunextPlugin } from "bunext-js/plugins";

export const analyticsPlugin: BunextPlugin = {
  priority: 10,
  
  router: {
    request: async (req) => {
      // Track page views for GET requests
      if (req.method === "GET" && !req.pathname.startsWith("/api/")) {
        await trackPageView({
          path: req.pathname,
          userAgent: req.request.headers.get("user-agent"),
          timestamp: Date.now()
        });
      }
      return req;
    },
    
    html_rewrite: {
      rewrite(rewriter, req) {
        // Inject analytics script
        rewriter.onDocument({
          end(end) {
            end.append(`
              <script>
                // Analytics tracking code
                (function() {
                  const analytics = {
                    track: (event, data) => {
                      fetch('/api/analytics', {
                        method: 'POST',
                        body: JSON.stringify({ event, data, path: '${req.pathname}' })
                      });
                    }
                  };
                  window.analytics = analytics;
                })();
              </script>
            `, { html: true });
          }
        });
      }
    }
  }
};
```

##### SEO Enhancement Plugin

Automatically optimize pages for search engines:

```typescript
// plugins/seo.ts
import type { BunextPlugin } from "bunext-js/plugins";

export const seoPlugin: BunextPlugin = {
  router: {
    html_rewrite: {
      initContext(req) {
        return {
          path: req.pathname,
          needsOptimization: !req.pathname.startsWith("/api/")
        };
      },
      
      rewrite(rewriter, req, context) {
        if (!context.needsOptimization) return;
        
        // Add meta descriptions
        rewriter.on("head", {
          element(el) {
            el.append(`
              <meta name="description" content="Page for ${context.path}">
              <meta property="og:url" content="${req.URL.href}">
              <meta name="twitter:card" content="summary_large_image">
            `, { html: true });
          }
        });
        
        // Optimize images
        rewriter.on("img", {
          element(el) {
            const src = el.getAttribute("src");
            if (src && !el.getAttribute("alt")) {
              el.setAttribute("alt", "Image");
            }
            // Add loading="lazy" for performance
            if (!el.getAttribute("loading")) {
              el.setAttribute("loading", "lazy");
            }
          }
        });
      }
    }
  }
};
```

##### Development Tools Plugin

Enhanced development experience:

```typescript
// plugins/dev-tools.ts
import type { BunextPlugin } from "bunext-js/plugins";

export const devToolsPlugin: BunextPlugin = {
  serverStart: {
    dev() {
      console.log("🚀 Development tools initialized");
      console.log("📁 Watching for file changes...");
    }
  },
  
  onFileSystemChange: async (filePath) => {
    if (!filePath) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      console.log(`🔄 [${timestamp}] TypeScript file updated: ${filePath}`);
    } else if (filePath.endsWith('.css')) {
      console.log(`🎨 [${timestamp}] CSS file updated: ${filePath}`);
      // Trigger CSS hot reload
    } else if (filePath.includes('/static/')) {
      console.log(`📦 [${timestamp}] Static asset updated: ${filePath}`);
    }
  },
  
  router: {
    html_rewrite: {
      rewrite(rewriter, req) {
        // Only in development
        if (process.env.NODE_ENV === 'development') {
          rewriter.onDocument({
            end(end) {
              end.append(`
                <script>
                  // Development tools
                  console.log('%c🚀 Bunext Dev Mode', 'color: #ff6b35; font-weight: bold;');
                  window.__BUNEXT_DEV__ = true;
                </script>
              `, { html: true });
            }
          });
        }
      }
    }
  }
};
```

##### Security Headers Plugin

Add security headers to all responses:

```typescript
// plugins/security.ts
import type { BunextPlugin } from "bunext-js/plugins";

export const securityPlugin: BunextPlugin = {
  priority: 0, // High priority to run first
  
  router: {
    request: async (req) => {
      // Add security headers
      const headers = new Headers();
      headers.set("X-Frame-Options", "DENY");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-XSS-Protection", "1; mode=block");
      headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'");
      
      // Merge with existing response headers when response is created
      req.securityHeaders = headers;
      
      return req;
    }
  }
};
```

#### Plugin Configuration

Register your plugins in the server configuration:

```typescript
// config/server.ts
import type { ServerConfig } from "bunext-js";
import { analyticsPlugin } from "../plugins/analytics";
import { seoPlugin } from "../plugins/seo";
import { devToolsPlugin } from "../plugins/dev-tools";

const Config: ServerConfig = {
  HTTPServer: {
    port: 3000,
  },
  
  bunext_plugins: [
    analyticsPlugin,
    seoPlugin,
    // Only load dev tools in development
    ...(process.env.NODE_ENV === 'development' ? [devToolsPlugin] : [])
  ]
};

export default Config;
```

#### Plugin Best Practices

| ✅ Do | ❌ Don't |
|-------|----------|
| Use appropriate priority levels | Block the request pipeline unnecessarily |
| Handle errors gracefully | Throw unhandled exceptions |
| Clean up resources in dev mode | Leave memory leaks |
| Use context in HTML rewriters | Store global state unsafely |
| Check environment before dev-only features | Run dev code in production |

#### Plugin Lifecycle Order

1. **`before_build_main`** - Before build starts
2. **`build`** - During build process
3. **`after_build`** - Process each build artifact (worker thread)
4. **`after_build_main`** - After build completes (main thread)
5. **`serverStart`** - When server initializes
6. **`router.request`** - For each HTTP request
7. **`router.html_rewrite`** - When rewriting HTML responses
8. **`onFileSystemChange`** - When files change (dev mode only)

### Performance Optimization

#### Multi-threading (Linux Only)

Configure multi-threaded HTTP workers for maximum performance:

```typescript
// config/server.ts
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    workers: 8, // Use 8 worker threads
    // Automatically detects CPU cores if not specified
  },
};
```

#### Static Page Caching

Implement intelligent caching strategies:

```tsx
"use static";

import { revalidateStatic } from "bunext-js/router/revalidate";

export async function getServerSideProps({ request }: { request: Request }) {
  // Cache for 1 hour, but revalidate in background
  revalidateStatic(request, 3600);
  
  const data = await fetchExpensiveData();
  
  return { data };
}

export default function CachedPage({ props }: { props: { data: any } }) {
  return (
    <div>
      <h1>Cached Content</h1>
      <pre>{JSON.stringify(props.data, null, 2)}</pre>
      <p>Generated at: {new Date().toISOString()}</p>
    </div>
  );
}
```

### WebSocket Support

Real-time communication with WebSocket integration:

```tsx
// Server-side WebSocket handler
export async function ServerHandleWebSocket(data: WebSocketMessage) {
  
  // Broadcast to all connected clients
  const clients = getWebSocketClients();
  
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "broadcast",
        data: data.payload,
        timestamp: Date.now()
      }));
    }
  });
  
  return { success: true };
}

// Client-side WebSocket usage
function RealTimeComponent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3010/ws");
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setMessages(prev => [...prev, message]);
    };
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      setSocket(ws);
    };
    
    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setSocket(null);
    };
    
    return () => ws.close();
  }, []);
  
  const sendMessage = (content: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "message",
        content,
        timestamp: Date.now()
      }));
    }
  };
  
  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className="message">
            {msg.content}
          </div>
        ))}
      </div>
      <input 
        type="text" 
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            sendMessage(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        placeholder="Type a message..."
      />
    </div>
  );
}
```


## 📊 Performance & Benchmarks

Bunext is engineered for maximum performance, leveraging Bun's speed and multi-threading capabilities.

### Benchmark Results

#### Single-Threaded Performance
![Single-Threaded Performance](https://raw.githubusercontent.com/shpaw415/bunext/main/benchmark/0.9.5/wrk-benchmark-single-threaded.png)

#### Multi-Threaded Performance (12 Workers)
![Multi-Threaded Performance](https://raw.githubusercontent.com/shpaw415/bunext/main/benchmark/0.9.5/wrk-benchamrk-multi-threaded.png)

### Performance Features

| Feature | Description | Performance Impact |
|---------|-------------|-------------------|
| **Multi-threading** | HTTP workers on Linux | 300%+ throughput increase |
| **Static Caching** | Built-in page caching | 80%+ faster response times |
| **Server Components** | Build-time rendering | Reduced client-side work |
| **Hot Reload** | Fast development updates | Sub-second rebuild times |
| **SQLite Integration** | Embedded database | No network latency |

### Optimization Techniques

#### 1. Multi-Worker Configuration

```typescript
// config/server.ts - Production
const Config: ServerConfig = {
  HTTPServer: {
    port: 3010,
    workers: 8, // Use multiple CPU cores
  },
};
```

#### 2. Static Page Optimization

```tsx
"use static";

// Cache expensive operations
export async function getServerSideProps() {
  const data = await expensiveDataFetch(); // Cached result
  return { data };
}
```

#### 3. Database Query Optimization

```typescript
// Efficient database queries
export async function ServerOptimizedQuery() {
  const db = Database();
  
  // Use specific columns instead of SELECT *
  const users = db.Users.select({
    columns: ["id", "username"], // Only needed fields
    where: { active: true },
    limit: 100 // Limit results
  });
  
  return users;
}
```

#### 4. Component Caching

```tsx
// Server components are cached automatically
export async function CachedComponent() {
  const data = await fetch("https://api.example.com/data")
    .then(r => r.json()); // Cached until revalidation
  
  return <div>{JSON.stringify(data)}</div>;
}
```

### Performance Monitoring

```tsx
// Built-in performance tracking
export async function ServerTrackPerformance() {
  
  const start = performance.now();
  
  // Your server logic here
  await someExpensiveOperation();
  
  const duration = performance.now() - start;
  console.log(`Operation took ${duration.toFixed(2)}ms`);
  
  return { success: true, duration };
}
```

## 🚀 Deployment

Deploy your Bunext application to production environments.

### Production Build

```bash
# Build for production
bun run build

# Start production server
bun run start
```

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
PORT=8080
PUBLIC_API_URL=https://api.yourdomain.com

# Database configuration
DATABASE_URL=sqlite://./production.db

# Security
JWT_SECRET=your-secure-jwt-secret
SESSION_SECRET=your-secure-session-secret
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN bun run build

# Expose port
EXPOSE 8080

# Start server
CMD ["bun", "run", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  bunext-app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Systemd Service

```ini
# /etc/systemd/system/bunext.service
[Unit]
Description=Bunext Application
After=network.target

[Service]
Type=simple
User=bunext
WorkingDirectory=/opt/bunext
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/bunext
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Development Setup

```bash
# Clone the repository
git clone https://github.com/shpaw415/bunext.git
cd bunext

# Install dependencies
bun install

# Run tests
bun test

# Start development
bun run dev
```

### Contribution Guidelines

1. **Fork the repository** and create your feature branch
2. **Write tests** for new functionality
3. **Follow TypeScript best practices**
4. **Update documentation** as needed
5. **Submit a pull request** with clear description

### Areas for Contribution

- 🐛 **Bug fixes** - Help identify and fix issues
- ✨ **New features** - Implement requested functionality  
- 📚 **Documentation** - Improve guides and examples
- 🧪 **Testing** - Add test coverage
- 🚀 **Performance** - Optimize framework performance

### Reporting Issues

When reporting bugs, please include:

- **Bun version** (`bun --version`)
- **Bunext version**
- **Operating system**
- **Minimal reproduction case**
- **Expected vs actual behavior**

## 📜 License

Bunext is open-source software licensed under the **MIT License**.

```
MIT License

Copyright (c) 2024 Bunext Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**🚀 Built with [Bun](https://bun.sh) | Inspired by [Next.js](https://nextjs.org) | Made with ❤️**

[Documentation](https://github.com/shpaw415/bunext) • [Examples](https://github.com/shpaw415/bunext/tree/main/examples) • [Community](https://github.com/shpaw415/bunext/discussions)

</div>


## � Changelog

<details>
<summary>� Version 0.11.x</summary>

### 0.11.6
- Fix CLI missing NODE_ENV
- Add Chrome DevTools protocol for workspace
- Refactored server-actions and server-components, moved to plugin format

### 0.11.5
- Fix useSession hook not updating properly after ServerAction modifies session
- Fix typo in CLI
- Remove unnecessary getSession props
- Fix dev mode serverAction and serverComponents not transpiling correctly

### 0.11.4
- Fix minor init type
- Upgrade typed route paths
- Other minor improvements

### 0.11.3
- Upgraded Link element - now an anchor element, Ctrl+click opens in new tab
- Link and navigate have type-safe route paths
- BunextPlugin has onFileSystemChange new key
- Update documentation for missing sections (API endpoints and server components)
- Head component for setting dynamic head data

### 0.11.1
- Build process worker thread (improve build time by removing process overhead)

</details>

<details>
<summary>� Version 0.10.x</summary>

### 0.10.4
- Add plugin system for altering build, request, and routing lifecycle
- Bunext global object updated

### 0.10.3
- Fix regression introduced in 0.9.18 where onRequest file wasn't imported correctly
- Much more verbose CLI outputs and automatic benchmarking

### 0.10.1
- Update Global Bunext object
- Refactor many components
- Dynamic components method change (only needs server config)
- Cleanup code for readability and maintainability

</details>

<details>
<summary>� Version 0.9.x</summary>

### 0.9.18
- New Global object Bunext for every Bunext feature
- Dynamic Module loading feature (load modules without knowing the name at first)
- HTTPServer options can be set from config file config/server.ts

### 0.9.17
- Redirection now possible in ServerAction
- Fix regression: API Endpoint cannot be reached (introduced in 0.9.10)

### 0.9.16
- Fix dev mode reloading page on every file modification
- Add CodeRabbit review
- Fix page wasn't reloading after file change if it wasn't index or layout

### 0.9.10
- Added more tests to prevent previous errors from recurring
- Fix `getServerSideProps` breaking request when `undefined` on route change/refresh in dev mode
- Faster development mode reducing build time exponentially

### 0.9.8
- Override session expiration using `session.setExpiration()`
- Fix params not reaching `getServerSideProps`

### 0.9.7
- Fix `getServerSideProps` breaking when returning `undefined`
- Fix update issue where it overwrites existing React & React-DOM
- Default React & React-DOM versions updated to `19.0.0`

### 0.9.6
- `"use static"` performance upgrade
- Routes exporting `default` verified as SSR elements now cached properly
- 80%+ performance boost (significantly reduces server load)
- New 0.8.x vs 0.9.5 benchmark
- Fix `"use static"` not caching for dynamic segments
- Dynamic pages now have 100% performance upgrade
- `"use static"` benchmark added

### 0.9.4
- Fix CSS not imported on direct access for CSS inside Page element
- SVG and CSS files now typed correctly
- **NEW FEATURE**: `"use static"` directive
  - Caches pages for specific paths (even with dynamic segments)
  - Example: `/a/path/[id]` caches `/a/path/1` and `/a/path/2`
  - Can be revalidated
- Router code cleaned
- Stronger fetch caching

### 0.9.3
- Fix CSS auto-imports for dynamic segments
- Auto-imported CSS rendered at first load, suppressing flickering

### 0.9.2
- Fix session not updating when modified outside an event
- Fix all TypeScript errors
- Fix false errors when compiling in dev mode with SSR component caching
- Dynamically update `<Head>` with `useHead`
- Added explicit exports → Projects may need to update imports
- `Head` data can be dynamic. Request object parsed as props to page element
- Direct access to `request` object from any server component
- Dev builds now more verbose and cleaner

### 0.9.0
- Removed unused code → Performance upgrade
- CSS now automatically imported into `<head>` component

</details>

<details>
<summary>� Version 0.8.x</summary>

### 0.8.26
- Fix Layout not rendering when inside dynamic segment directory and request doesn't use client-side router (direct access)
- Parallelized layout imports to reduce cold start & dev mode loading times

### 0.8.24
- Fix crash with dev client WebSocket
- Fix Layout not working if inside dynamic segment directory

### 0.8.23
- Fix crash in dev mode introduced in Bun version `1.1.43`

### 0.8.22
- Fix missing regex for `[segmentName]`
- Fix concurrent read & write of database
- Add utility functions to generate fake data
- Cache cleared in browser between dev versions

### 0.8.21
- Update SVG caching strategy for cold start improvement and cache validation based on file hash
- New caching system for SSR Elements
- Fix long-time bug where builds crashed when Server Components list was too large
- Improve build speed
- Added Single-Threaded & Multi-Threaded Benchmarks in README

### 0.8.20
- Caching SVG for more fluid development experience

### 0.8.19
- Enforce tests
- Remove unused files in build after each build
- Router: `[segmentName].tsx` now supported
  - **Previously**: Only `[id].tsx` was supported
  - **Now**: Any `[segmentName]` supported (e.g., `[foo].tsx`, `[bar].tsx`)
- Update README
- SVG loader now uses SVGR (stable)

### 0.8.18
- Fix Database schema union type making number as string
- Database schema in JSON objects in arrays considered unions
- Database schema union in JSON column type can be string or/and number
- Session strategy changed and session timeout automatically updated
- Database `LIKE` operator for `SELECT` operation
- Direct access to database for custom requests (**must be secured manually**)
- Added tests for database
- Automatic session timeout update UI

</details>

