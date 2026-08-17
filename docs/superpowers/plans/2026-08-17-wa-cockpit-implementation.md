# WA Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `cockpit` — a separate backend + dashboard that sits beside the unmodified OpenWA gateway, giving a business WhatsApp line AI-first replies with per-chat human takeover.

**Architecture:** `cockpit-backend` (Node/TypeScript/Express/Prisma/Postgres) receives inbound messages via an OpenWA webhook, branches on a per-conversation `mode` (`ai`/`human`), and sends replies out via OpenWA's REST API. `cockpit-dashboard` (React/Vite/TypeScript) is where agents log in, toggle mode per chat, and reply when in human mode. OpenWA itself is never modified.

**Tech Stack:** Node 20+, TypeScript, Express 4, Prisma ORM, PostgreSQL, `ws` (WebSocket), bcryptjs, jsonwebtoken, Vitest + Supertest (backend tests), React 18 + Vite, React Router, @testing-library/react (frontend tests), Docker + Docker Compose.

## Global Constraints

- OpenWA is never modified — all integration is via its webhook (inbound) and REST API (outbound). Source: design spec, "Architecture".
- v1 is text-only. Non-text inbound messages are stored as `[unsupported attachment]` placeholders. Source: design spec, "Message Types (v1 scope)".
- v1 uses a fixed system-prompt persona only — no RAG. Source: design spec, "LLM Provider Abstraction".
- LLM call failure must never drop the customer's message: force `mode=human` and set `needsAttention=true`. Source: design spec, "Error Handling".
- LLM provider is switchable at runtime via a Settings row, not a redeploy. Four providers: `deepseek` (default), `claude`, `openai`, `google`. Source: design spec, "LLM Provider Abstraction".
- Two agent roles: `admin` (manages agents, provider/keys, persona) and `agent` (handles chats only). Source: design spec, "Dashboard".
- Deployment is Docker Compose, deployment-agnostic (VPS vs local undecided). Source: design spec, "Deployment".

**Important integration note:** The exact JSON shape of OpenWA's inbound webhook and outbound send-message REST endpoint is not fully known from the design spec alone (OpenWA is a third-party repo). Tasks 11 and 12 below define a concrete, documented *assumed* shape and isolate all OpenWA-specific parsing behind a single adapter module (`src/openwa/client.ts`) and a single webhook DTO (`src/webhooks/types.ts`). Before running against a real OpenWA instance, whoever executes Tasks 11–12 must open the cloned `rmyndharis/OpenWA` repo's `docs/` folder and confirm the real payload/endpoint match this assumption, adjusting only those two files if not. No other file touches OpenWA's wire format.

---

## File Structure

### cockpit-backend/
- `package.json`, `tsconfig.json`, `vitest.config.ts` — project config
- `prisma/schema.prisma` — data model (Task 1)
- `src/db/client.ts` — Prisma client singleton (Task 1)
- `src/auth/password.ts` — hash/verify password (Task 2)
- `src/auth/jwt.ts` — sign/verify JWT (Task 2)
- `src/middleware/requireAuth.ts` — JWT verify + role-check middleware (Task 3)
- `src/routes/auth.ts` — POST /auth/login (Task 3)
- `src/routes/agents.ts` — agent CRUD, admin-only (Task 4)
- `src/llm/types.ts` — `ChatMessage`, `LLMProvider` interfaces (Task 5)
- `src/llm/registry.ts` — active-provider resolver (Task 5)
- `src/llm/providers/deepseek.ts` (Task 6)
- `src/llm/providers/claude.ts` (Task 7)
- `src/llm/providers/openai.ts` (Task 8)
- `src/llm/providers/google.ts` (Task 9)
- `src/routes/settings.ts` — get/update provider+keys+persona, admin-only (Task 10)
- `src/openwa/client.ts` — OpenWA REST adapter, `sendWaMessage()` (Task 11)
- `src/webhooks/types.ts` — assumed OpenWA inbound webhook DTO (Task 12)
- `src/webhooks/openwaWebhook.ts` — POST /webhooks/openwa, upsert conversation+message (Task 12)
- `src/ai/autoReply.ts` — AI reply orchestration + failure handling (Task 13)
- `src/routes/conversations.ts` — list/detail/toggle mode (Task 14)
- `src/routes/messages.ts` — agent sends reply (Task 15)
- `src/ws/hub.ts` — WebSocket broadcast hub (Task 16)
- `src/app.ts` — Express app assembly, exported for tests (Task 17)
- `src/server.ts` — process entrypoint, `app.listen` + WS upgrade (Task 17)
- `src/seed.ts` — seeds first admin agent (Task 4)

### cockpit-dashboard/
- `package.json`, `vite.config.ts`, `tsconfig.json`
- `src/api/client.ts` — fetch wrapper, attaches JWT (Task 18)
- `src/auth/AuthContext.tsx` — login state, token storage (Task 18)
- `src/pages/Login.tsx` (Task 18)
- `src/pages/ChatList.tsx` (Task 19)
- `src/pages/ChatDetail.tsx` (Task 20)
- `src/ws/useConversationSocket.ts` — live-update hook (Task 21)
- `src/pages/Settings.tsx` (Task 22)
- `src/pages/Agents.tsx` (Task 23)
- `src/App.tsx` — routing (Task 18)

### deployment/
- `cockpit-backend/Dockerfile` (Task 24)
- `cockpit-dashboard/Dockerfile` (Task 24)
- `docker-compose.yml` (Task 24)

---

### Task 1: Backend Scaffold + Data Model

**Files:**
- Create: `cockpit-backend/package.json`
- Create: `cockpit-backend/tsconfig.json`
- Create: `cockpit-backend/vitest.config.ts`
- Create: `cockpit-backend/prisma/schema.prisma`
- Create: `cockpit-backend/src/db/client.ts`
- Test: `cockpit-backend/src/db/client.test.ts`

**Interfaces:**
- Produces: `prisma` Prisma Client singleton exported from `src/db/client.ts`, models `Agent`, `Conversation`, `Message`, `Settings` with enums `AgentRole` (`admin`|`agent`), `ConversationMode` (`ai`|`human`), `MessageDirection` (`in`|`out`), `LLMProviderName` (`deepseek`|`claude`|`openai`|`google`).

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cockpit-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.16.0",
    "@types/supertest": "^6.0.2",
    "@types/ws": "^8.5.12",
    "prisma": "^5.20.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true
  }
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd cockpit-backend && npm install`
Expected: installs cleanly, creates `package-lock.json`.

- [ ] **Step 5: Write the Prisma schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AgentRole {
  admin
  agent
}

enum ConversationMode {
  ai
  human
}

enum MessageDirection {
  in
  out
}

enum LLMProviderName {
  deepseek
  claude
  openai
  google
}

model Agent {
  id            String         @id @default(uuid())
  name          String
  email         String         @unique
  passwordHash  String
  role          AgentRole
  createdAt     DateTime       @default(now())
  conversations Conversation[] @relation("AssignedAgent")
}

model Conversation {
  id              String            @id @default(uuid())
  waChatId        String            @unique
  mode            ConversationMode  @default(ai)
  assignedAgentId String?
  assignedAgent   Agent?            @relation("AssignedAgent", fields: [assignedAgentId], references: [id])
  needsAttention  Boolean           @default(false)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  messages        Message[]
}

model Message {
  id             String            @id @default(uuid())
  conversationId String
  conversation   Conversation      @relation(fields: [conversationId], references: [id])
  direction      MessageDirection
  sender         String
  body           String
  waMessageId    String?
  createdAt      DateTime          @default(now())
}

model Settings {
  id             Int              @id @default(1)
  activeProvider LLMProviderName  @default(deepseek)
  deepseekApiKey String?
  claudeApiKey   String?
  openaiApiKey   String?
  googleApiKey   String?
  personaPrompt  String           @default("You are a helpful business assistant.")
}
```

- [ ] **Step 6: Create .env for local Postgres and run the migration**

Create `cockpit-backend/.env`:
```
DATABASE_URL="postgresql://cockpit:cockpit@localhost:5432/cockpit"
```

Run: `docker run --rm -d --name cockpit-pg -e POSTGRES_USER=cockpit -e POSTGRES_PASSWORD=cockpit -e POSTGRES_DB=cockpit -p 5432:5432 postgres:16`
Run: `cd cockpit-backend && npx prisma migrate dev --name init`
Expected: migration succeeds, tables created, `@prisma/client` generated.

- [ ] **Step 7: Create the Prisma client singleton**

```ts
// src/db/client.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 8: Write the failing test**

```ts
// src/db/client.test.ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./client.js";

describe("prisma client", () => {
  it("creates and reads a Settings row", async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {}
    });
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(settings?.activeProvider).toBe("deepseek");
  });

  afterAll(async () => {
    await prisma.settings.deleteMany();
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 9: Run test to verify it passes** (requires the Postgres container from Step 6 running)

Run: `npx vitest run src/db/client.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git init
git add cockpit-backend
git commit -m "chore: scaffold cockpit-backend with Prisma data model"
```

---

### Task 2: Password Hashing + JWT Utilities

**Files:**
- Create: `cockpit-backend/src/auth/password.ts`
- Create: `cockpit-backend/src/auth/jwt.ts`
- Test: `cockpit-backend/src/auth/password.test.ts`
- Test: `cockpit-backend/src/auth/jwt.test.ts`

**Interfaces:**
- Consumes: none (pure utility module)
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `signAgentToken(payload: { agentId: string; role: "admin" | "agent" }): string`
  - `verifyAgentToken(token: string): { agentId: string; role: "admin" | "agent" }`

- [ ] **Step 1: Write the failing password test**

```ts
// src/auth/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auth/password.test.ts`
Expected: FAIL — `password.ts` does not exist

- [ ] **Step 3: Implement password.ts**

```ts
// src/auth/password.ts
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/auth/password.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing JWT test**

```ts
// src/auth/jwt.test.ts
import { describe, it, expect } from "vitest";
import { signAgentToken, verifyAgentToken } from "./jwt.js";

describe("jwt", () => {
  it("round-trips agent claims", () => {
    const token = signAgentToken({ agentId: "abc-123", role: "agent" });
    const decoded = verifyAgentToken(token);
    expect(decoded.agentId).toBe("abc-123");
    expect(decoded.role).toBe("agent");
  });

  it("throws on an invalid token", () => {
    expect(() => verifyAgentToken("not-a-real-token")).toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/auth/jwt.test.ts`
Expected: FAIL — `jwt.ts` does not exist

- [ ] **Step 7: Implement jwt.ts**

```ts
// src/auth/jwt.ts
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export interface AgentTokenPayload {
  agentId: string;
  role: "admin" | "agent";
}

export function signAgentToken(payload: AgentTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "12h" });
}

export function verifyAgentToken(token: string): AgentTokenPayload {
  return jwt.verify(token, SECRET) as AgentTokenPayload;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/auth/jwt.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add cockpit-backend/src/auth
git commit -m "feat: add password hashing and JWT utilities"
```

---

### Task 3: Login Route + requireAuth Middleware

**Files:**
- Create: `cockpit-backend/src/middleware/requireAuth.ts`
- Create: `cockpit-backend/src/routes/auth.ts`
- Test: `cockpit-backend/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `hashPassword`/`verifyPassword` (Task 2), `signAgentToken`/`verifyAgentToken` (Task 2)
- Produces:
  - `requireAuth(roles?: ("admin"|"agent")[])` — Express middleware, sets `req.agent = { agentId, role }` on success, `401`/`403` otherwise
  - `authRouter` — Express Router with `POST /login` returning `{ token: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";
import { authRouter } from "./auth.js";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);

beforeAll(async () => {
  await prisma.agent.create({
    data: {
      name: "Test Admin",
      email: "admin@test.com",
      passwordHash: await hashPassword("secret123"),
      role: "admin"
    }
  });
});

afterAll(async () => {
  await prisma.agent.deleteMany();
  await prisma.$disconnect();
});

describe("POST /auth/login", () => {
  it("returns a token for valid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "wrong" });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/auth.test.ts`
Expected: FAIL — `auth.ts` route module does not exist

- [ ] **Step 3: Implement the login route**

```ts
// src/routes/auth.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { verifyPassword } from "../auth/password.js";
import { signAgentToken } from "../auth/jwt.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const agent = await prisma.agent.findUnique({ where: { email } });
  if (!agent || !(await verifyPassword(password, agent.passwordHash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = signAgentToken({ agentId: agent.id, role: agent.role });
  res.json({ token });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Implement requireAuth middleware**

```ts
// src/middleware/requireAuth.ts
import type { Request, Response, NextFunction } from "express";
import { verifyAgentToken, type AgentTokenPayload } from "../auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      agent?: AgentTokenPayload;
    }
  }
}

export function requireAuth(roles?: ("admin" | "agent")[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing bearer token" });
    }
    try {
      const payload = verifyAgentToken(header.slice("Bearer ".length));
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "insufficient role" });
      }
      req.agent = payload;
      next();
    } catch {
      res.status(401).json({ error: "invalid token" });
    }
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add cockpit-backend/src/routes/auth.ts cockpit-backend/src/routes/auth.test.ts cockpit-backend/src/middleware/requireAuth.ts
git commit -m "feat: add login route and requireAuth middleware"
```

---

### Task 4: Agents CRUD (Admin-Only) + Seed Script

**Files:**
- Create: `cockpit-backend/src/routes/agents.ts`
- Create: `cockpit-backend/src/seed.ts`
- Test: `cockpit-backend/src/routes/agents.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `hashPassword` (Task 2), `requireAuth` (Task 3), `signAgentToken` (Task 2)
- Produces: `agentsRouter` — `GET /agents`, `POST /agents`, `DELETE /agents/:id`, all admin-only

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/agents.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { agentsRouter } from "./agents.js";

const app = express();
app.use(express.json());
app.use("/agents", requireAuth(["admin"]), agentsRouter);

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.agent.create({
    data: {
      name: "Admin",
      email: "admin2@test.com",
      passwordHash: await hashPassword("secret123"),
      role: "admin"
    }
  });
  adminToken = signAgentToken({ agentId: admin.id, role: "admin" });
});

afterAll(async () => {
  await prisma.agent.deleteMany();
  await prisma.$disconnect();
});

describe("agents routes", () => {
  it("creates and lists an agent", async () => {
    const create = await request(app)
      .post("/agents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Agent Smith", email: "smith@test.com", password: "pw123456", role: "agent" });
    expect(create.status).toBe(201);
    expect(create.body.email).toBe("smith@test.com");
    expect(create.body.passwordHash).toBeUndefined();

    const list = await request(app).get("/agents").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/agents");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/agents.test.ts`
Expected: FAIL — `agents.ts` does not exist

- [ ] **Step 3: Implement agents.ts**

```ts
// src/routes/agents.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";

export const agentsRouter = Router();

agentsRouter.get("/", async (_req, res) => {
  const agents = await prisma.agent.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.json(agents);
});

agentsRouter.post("/", async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string; email?: string; password?: string; role?: "admin" | "agent";
  };
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role are required" });
  }
  const agent = await prisma.agent.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
    select: { id: true, name: true, email: true, role: true, createdAt: true }
  });
  res.status(201).json(agent);
});

agentsRouter.delete("/:id", async (req, res) => {
  await prisma.agent.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/agents.test.ts`
Expected: PASS

- [ ] **Step 5: Write the seed script**

```ts
// src/seed.ts
import { prisma } from "./db/client.js";
import { hashPassword } from "./auth/password.js";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const existing = await prisma.agent.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping.`);
    return;
  }

  await prisma.agent.create({
    data: { name: "Admin", email, passwordHash: await hashPassword(password), role: "admin" }
  });
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  console.log(`Seeded admin ${email}. Change the password after first login.`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Commit**

```bash
git add cockpit-backend/src/routes/agents.ts cockpit-backend/src/routes/agents.test.ts cockpit-backend/src/seed.ts
git commit -m "feat: add admin-only agent CRUD and seed script"
```

---

### Task 5: LLM Provider Interface + Registry

**Files:**
- Create: `cockpit-backend/src/llm/types.ts`
- Create: `cockpit-backend/src/llm/registry.ts`
- Test: `cockpit-backend/src/llm/registry.test.ts`

**Interfaces:**
- Consumes: `Settings` model (Task 1) for `activeProvider` + per-provider API keys
- Produces:
  - `ChatMessage = { role: "user" | "assistant"; content: string }`
  - `LLMProvider = { name: string; reply(history: ChatMessage[], systemPrompt: string): Promise<string> }`
  - `resolveProvider(settings: Settings, providers: Record<LLMProviderName, (apiKey: string) => LLMProvider>): LLMProvider`

- [ ] **Step 1: Write the failing test**

```ts
// src/llm/registry.test.ts
import { describe, it, expect } from "vitest";
import { resolveProvider } from "./registry.js";
import type { LLMProvider } from "./types.js";

function fakeProvider(name: string): (key: string) => LLMProvider {
  return (apiKey: string) => ({
    name,
    reply: async () => `${name}:${apiKey}`
  });
}

describe("resolveProvider", () => {
  it("picks the provider factory matching activeProvider and injects its key", async () => {
    const provider = resolveProvider(
      {
        id: 1,
        activeProvider: "claude",
        deepseekApiKey: "dk",
        claudeApiKey: "ck",
        openaiApiKey: "ok",
        googleApiKey: "gk",
        personaPrompt: "persona"
      },
      {
        deepseek: fakeProvider("deepseek"),
        claude: fakeProvider("claude"),
        openai: fakeProvider("openai"),
        google: fakeProvider("google")
      }
    );
    expect(provider.name).toBe("claude");
    expect(await provider.reply([], "sys")).toBe("claude:ck");
  });

  it("throws if the active provider has no API key configured", () => {
    expect(() =>
      resolveProvider(
        {
          id: 1,
          activeProvider: "openai",
          deepseekApiKey: null,
          claudeApiKey: null,
          openaiApiKey: null,
          googleApiKey: null,
          personaPrompt: "persona"
        },
        {
          deepseek: fakeProvider("deepseek"),
          claude: fakeProvider("claude"),
          openai: fakeProvider("openai"),
          google: fakeProvider("google")
        }
      )
    ).toThrow(/no API key/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/registry.test.ts`
Expected: FAIL — `types.ts`/`registry.ts` do not exist

- [ ] **Step 3: Implement types.ts**

```ts
// src/llm/types.ts
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  name: string;
  reply(history: ChatMessage[], systemPrompt: string): Promise<string>;
}

export type LLMProviderName = "deepseek" | "claude" | "openai" | "google";

export interface SettingsLike {
  id: number;
  activeProvider: LLMProviderName;
  deepseekApiKey: string | null;
  claudeApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
  personaPrompt: string;
}
```

- [ ] **Step 4: Implement registry.ts**

```ts
// src/llm/registry.ts
import type { LLMProvider, LLMProviderName, SettingsLike } from "./types.js";

const KEY_FIELD: Record<LLMProviderName, keyof SettingsLike> = {
  deepseek: "deepseekApiKey",
  claude: "claudeApiKey",
  openai: "openaiApiKey",
  google: "googleApiKey"
};

export function resolveProvider(
  settings: SettingsLike,
  providers: Record<LLMProviderName, (apiKey: string) => LLMProvider>
): LLMProvider {
  const apiKey = settings[KEY_FIELD[settings.activeProvider]] as string | null;
  if (!apiKey) {
    throw new Error(`No API key configured for active provider "${settings.activeProvider}"`);
  }
  return providers[settings.activeProvider](apiKey);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/llm/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add cockpit-backend/src/llm/types.ts cockpit-backend/src/llm/registry.ts cockpit-backend/src/llm/registry.test.ts
git commit -m "feat: add LLM provider interface and runtime registry"
```

---

### Task 6: DeepSeek Provider

**Files:**
- Create: `cockpit-backend/src/llm/providers/deepseek.ts`
- Test: `cockpit-backend/src/llm/providers/deepseek.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `LLMProvider` (Task 5)
- Produces: `createDeepSeekProvider(apiKey: string): LLMProvider`

DeepSeek's API is OpenAI-compatible (`POST https://api.deepseek.com/chat/completions`, `Authorization: Bearer <key>`, body `{ model, messages }`, response `choices[0].message.content`).

- [ ] **Step 1: Write the failing test**

```ts
// src/llm/providers/deepseek.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createDeepSeekProvider } from "./deepseek.js";

describe("createDeepSeekProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the DeepSeek chat completions endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hello there!" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createDeepSeekProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hello there!");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    const provider = createDeepSeekProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/deepseek/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/providers/deepseek.test.ts`
Expected: FAIL — `deepseek.ts` does not exist

- [ ] **Step 3: Implement deepseek.ts**

```ts
// src/llm/providers/deepseek.ts
import type { ChatMessage, LLMProvider } from "../types.js";

export function createDeepSeekProvider(apiKey: string): LLMProvider {
  return {
    name: "deepseek",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: systemPrompt }, ...history]
        })
      });
      if (!res.ok) {
        throw new Error(`deepseek request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/providers/deepseek.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/llm/providers/deepseek.ts cockpit-backend/src/llm/providers/deepseek.test.ts
git commit -m "feat: add DeepSeek LLM provider"
```

---

### Task 7: Claude Provider

**Files:**
- Create: `cockpit-backend/src/llm/providers/claude.ts`
- Test: `cockpit-backend/src/llm/providers/claude.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `LLMProvider` (Task 5)
- Produces: `createClaudeProvider(apiKey: string): LLMProvider`

Anthropic Messages API: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, body `{ model, max_tokens, system, messages }`, response `content[0].text`.

- [ ] **Step 1: Write the failing test**

```ts
// src/llm/providers/claude.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createClaudeProvider } from "./claude.js";

describe("createClaudeProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the Anthropic Messages API and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Hi from Claude" }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createClaudeProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from Claude");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key", "anthropic-version": "2023-06-01" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" }));
    const provider = createClaudeProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/claude/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/providers/claude.test.ts`
Expected: FAIL — `claude.ts` does not exist

- [ ] **Step 3: Implement claude.ts**

```ts
// src/llm/providers/claude.ts
import type { ChatMessage, LLMProvider } from "../types.js";

export function createClaudeProvider(apiKey: string): LLMProvider {
  return {
    name: "claude",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: history
        })
      });
      if (!res.ok) {
        throw new Error(`claude request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { content: { type: string; text: string }[] };
      return data.content[0].text;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/providers/claude.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/llm/providers/claude.ts cockpit-backend/src/llm/providers/claude.test.ts
git commit -m "feat: add Claude LLM provider"
```

---

### Task 8: OpenAI Provider

**Files:**
- Create: `cockpit-backend/src/llm/providers/openai.ts`
- Test: `cockpit-backend/src/llm/providers/openai.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `LLMProvider` (Task 5)
- Produces: `createOpenAIProvider(apiKey: string): LLMProvider`

OpenAI Chat Completions API: `POST https://api.openai.com/v1/chat/completions`, header `Authorization: Bearer <key>`, body `{ model, messages }`, response `choices[0].message.content`.

- [ ] **Step 1: Write the failing test**

```ts
// src/llm/providers/openai.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createOpenAIProvider } from "./openai.js";

describe("createOpenAIProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the OpenAI chat completions endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hi from GPT" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from GPT");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }));
    const provider = createOpenAIProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/openai/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/providers/openai.test.ts`
Expected: FAIL — `openai.ts` does not exist

- [ ] **Step 3: Implement openai.ts**

```ts
// src/llm/providers/openai.ts
import type { ChatMessage, LLMProvider } from "../types.js";

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    name: "openai",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: systemPrompt }, ...history]
        })
      });
      if (!res.ok) {
        throw new Error(`openai request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/providers/openai.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/llm/providers/openai.ts cockpit-backend/src/llm/providers/openai.test.ts
git commit -m "feat: add OpenAI LLM provider"
```

---

### Task 9: Google (Gemini) Provider

**Files:**
- Create: `cockpit-backend/src/llm/providers/google.ts`
- Test: `cockpit-backend/src/llm/providers/google.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`, `LLMProvider` (Task 5)
- Produces: `createGoogleProvider(apiKey: string): LLMProvider`

Gemini API: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=<key>`, body `{ contents: [{role, parts:[{text}]}], systemInstruction: {parts:[{text}]} }`, response `candidates[0].content.parts[0].text`.

- [ ] **Step 1: Write the failing test**

```ts
// src/llm/providers/google.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createGoogleProvider } from "./google.js";

describe("createGoogleProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the Gemini generateContent endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Hi from Gemini" }] } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGoogleProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from Gemini");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("key=test-key");
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" }));
    const provider = createGoogleProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/google/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm/providers/google.test.ts`
Expected: FAIL — `google.ts` does not exist

- [ ] **Step 3: Implement google.ts**

```ts
// src/llm/providers/google.ts
import type { ChatMessage, LLMProvider } from "../types.js";

export function createGoogleProvider(apiKey: string): LLMProvider {
  return {
    name: "google",
    async reply(history: ChatMessage[], systemPrompt: string): Promise<string> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: history.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        })
      });
      if (!res.ok) {
        throw new Error(`google request failed with status ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        candidates: { content: { parts: { text: string }[] } }[];
      };
      return data.candidates[0].content.parts[0].text;
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm/providers/google.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/llm/providers/google.ts cockpit-backend/src/llm/providers/google.test.ts
git commit -m "feat: add Google Gemini LLM provider"
```

---

### Task 10: Settings Route (Admin-Only)

**Files:**
- Create: `cockpit-backend/src/routes/settings.ts`
- Test: `cockpit-backend/src/routes/settings.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `requireAuth` (Task 3)
- Produces: `settingsRouter` — `GET /settings` (redacts API keys to booleans `hasKey`), `PUT /settings` (updates `activeProvider`, any subset of API keys, `personaPrompt`)

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/settings.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { settingsRouter } from "./settings.js";

const app = express();
app.use(express.json());
app.use("/settings", requireAuth(["admin"]), settingsRouter);

let adminToken: string;

beforeAll(async () => {
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  adminToken = signAgentToken({ agentId: "admin-1", role: "admin" });
});

afterAll(async () => {
  await prisma.settings.deleteMany();
  await prisma.$disconnect();
});

describe("settings routes", () => {
  it("gets settings with API keys redacted to booleans", async () => {
    const res = await request(app).get("/settings").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activeProvider).toBe("deepseek");
    expect(res.body.deepseekApiKey).toBeUndefined();
    expect(res.body.hasDeepseekKey).toBe(false);
  });

  it("updates the active provider and persona prompt", async () => {
    const put = await request(app)
      .put("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ activeProvider: "claude", claudeApiKey: "sk-ant-xyz", personaPrompt: "You are Acme's support bot." });
    expect(put.status).toBe(200);
    expect(put.body.activeProvider).toBe("claude");
    expect(put.body.hasClaudeKey).toBe(true);

    const stored = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(stored?.claudeApiKey).toBe("sk-ant-xyz");
    expect(stored?.personaPrompt).toBe("You are Acme's support bot.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/settings.test.ts`
Expected: FAIL — `settings.ts` does not exist

- [ ] **Step 3: Implement settings.ts**

```ts
// src/routes/settings.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import type { LLMProviderName } from "../llm/types.js";

export const settingsRouter = Router();

function redact(settings: {
  activeProvider: LLMProviderName;
  personaPrompt: string;
  deepseekApiKey: string | null;
  claudeApiKey: string | null;
  openaiApiKey: string | null;
  googleApiKey: string | null;
}) {
  return {
    activeProvider: settings.activeProvider,
    personaPrompt: settings.personaPrompt,
    hasDeepseekKey: Boolean(settings.deepseekApiKey),
    hasClaudeKey: Boolean(settings.claudeApiKey),
    hasOpenaiKey: Boolean(settings.openaiApiKey),
    hasGoogleKey: Boolean(settings.googleApiKey)
  };
}

settingsRouter.get("/", async (_req, res) => {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  res.json(redact(settings));
});

settingsRouter.put("/", async (req, res) => {
  const { activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt } =
    req.body as Partial<{
      activeProvider: LLMProviderName;
      deepseekApiKey: string;
      claudeApiKey: string;
      openaiApiKey: string;
      googleApiKey: string;
      personaPrompt: string;
    }>;

  const updated = await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt },
    update: { activeProvider, deepseekApiKey, claudeApiKey, openaiApiKey, googleApiKey, personaPrompt }
  });
  res.json(redact(updated));
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/routes/settings.ts cockpit-backend/src/routes/settings.test.ts
git commit -m "feat: add admin-only settings route for LLM provider config"
```

---

### Task 11: OpenWA REST Adapter

**Files:**
- Create: `cockpit-backend/src/openwa/client.ts`
- Test: `cockpit-backend/src/openwa/client.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `OpenWaConfig = { baseUrl: string; apiKey: string; sessionId: string }`
  - `sendWaMessage(config: OpenWaConfig, chatId: string, text: string): Promise<{ waMessageId: string }>`

**Before implementing:** open the cloned `rmyndharis/OpenWA` repo's `docs/` folder and its `dashboard`/`modules/message` source to confirm the real send-message endpoint path, auth header name, and response shape. The implementation below is a documented assumption (`POST {baseUrl}/api/sessions/{sessionId}/messages/send`, header `X-API-Key`, body `{ chatId, text }`, response `{ id: string }`) — if the real API differs, this is the only file to change; the test's mocked shape should be updated to match reality.

- [ ] **Step 1: Write the failing test**

```ts
// src/openwa/client.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendWaMessage } from "./client.js";

describe("sendWaMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to the session's send endpoint with the API key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWaMessage(
      { baseUrl: "http://openwa.local", apiKey: "key-1", sessionId: "sess-1" },
      "1234567890@c.us",
      "Hello!"
    );

    expect(result).toEqual({ waMessageId: "wamid.123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://openwa.local/api/sessions/sess-1/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "key-1" }),
        body: JSON.stringify({ chatId: "1234567890@c.us", text: "Hello!" })
      })
    );
  });

  it("throws if OpenWA responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "gateway down" }));
    await expect(
      sendWaMessage({ baseUrl: "http://openwa.local", apiKey: "key-1", sessionId: "sess-1" }, "chat", "hi")
    ).rejects.toThrow(/openwa/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/openwa/client.test.ts`
Expected: FAIL — `client.ts` does not exist

- [ ] **Step 3: Implement client.ts**

```ts
// src/openwa/client.ts
export interface OpenWaConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

export async function sendWaMessage(
  config: OpenWaConfig,
  chatId: string,
  text: string
): Promise<{ waMessageId: string }> {
  const res = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey
    },
    body: JSON.stringify({ chatId, text })
  });
  if (!res.ok) {
    throw new Error(`openwa send failed with status ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { waMessageId: data.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/openwa/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/openwa/client.ts cockpit-backend/src/openwa/client.test.ts
git commit -m "feat: add OpenWA REST adapter for sending WhatsApp messages"
```

---

### Task 12: Inbound Webhook Handler

**Files:**
- Create: `cockpit-backend/src/webhooks/types.ts`
- Create: `cockpit-backend/src/webhooks/openwaWebhook.ts`
- Test: `cockpit-backend/src/webhooks/openwaWebhook.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1)
- Produces:
  - `OpenWaInboundWebhook = { sessionId: string; chatId: string; messageId: string; fromMe: boolean; type: string; body: string; timestamp: number }` (documented assumption, see note below)
  - `openwaWebhookRouter` — `POST /webhooks/openwa`: upserts `Conversation` by `waChatId`, inserts an inbound `Message` (`direction:"in"`, `sender:"customer"`); non-`"chat"` types store `body = "[unsupported attachment]"`; `fromMe: true` payloads are ignored (200, no-op) since they're the bot's own sent messages echoed back; returns `{ conversationId, mode }` on success

**Before implementing:** confirm the real OpenWA webhook payload shape against its `docs/` folder (the module that fires webhooks, and its HMAC signature header if present). If it differs, only `types.ts` and the parsing in `openwaWebhook.ts` need to change — the conversation/message upsert logic below is independent of the exact wire shape.

- [ ] **Step 1: Write the failing test**

```ts
// src/webhooks/openwaWebhook.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { openwaWebhookRouter } from "./openwaWebhook.js";

const app = express();
app.use(express.json());
app.use("/webhooks/openwa", openwaWebhookRouter);

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /webhooks/openwa", () => {
  it("creates a new conversation in AI mode and logs the inbound text message", async () => {
    const res = await request(app).post("/webhooks/openwa").send({
      sessionId: "sess-1",
      chatId: "1234@c.us",
      messageId: "wamid.1",
      fromMe: false,
      type: "chat",
      body: "Hi, is this Acme Bikes?",
      timestamp: 1700000000
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("ai");

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "1234@c.us" }, include: { messages: true } });
    expect(convo?.messages).toHaveLength(1);
    expect(convo?.messages[0].body).toBe("Hi, is this Acme Bikes?");
    expect(convo?.messages[0].sender).toBe("customer");
  });

  it("reuses an existing conversation and preserves its current mode", async () => {
    await prisma.conversation.create({ data: { waChatId: "5555@c.us", mode: "human" } });

    const res = await request(app).post("/webhooks/openwa").send({
      sessionId: "sess-1",
      chatId: "5555@c.us",
      messageId: "wamid.2",
      fromMe: false,
      type: "chat",
      body: "Following up on my order",
      timestamp: 1700000100
    });

    expect(res.body.mode).toBe("human");
  });

  it("stores non-text messages as an unsupported-attachment placeholder", async () => {
    const res = await request(app).post("/webhooks/openwa").send({
      sessionId: "sess-1",
      chatId: "7777@c.us",
      messageId: "wamid.3",
      fromMe: false,
      type: "image",
      body: "",
      timestamp: 1700000200
    });

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "7777@c.us" }, include: { messages: true } });
    expect(convo?.messages[0].body).toBe("[unsupported attachment]");
    expect(res.status).toBe(200);
  });

  it("ignores fromMe echoes", async () => {
    const res = await request(app).post("/webhooks/openwa").send({
      sessionId: "sess-1",
      chatId: "9999@c.us",
      messageId: "wamid.4",
      fromMe: true,
      type: "chat",
      body: "This was sent by us",
      timestamp: 1700000300
    });

    expect(res.status).toBe(200);
    const convo = await prisma.conversation.findUnique({ where: { waChatId: "9999@c.us" } });
    expect(convo).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/webhooks/openwaWebhook.test.ts`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Implement types.ts**

```ts
// src/webhooks/types.ts
export interface OpenWaInboundWebhook {
  sessionId: string;
  chatId: string;
  messageId: string;
  fromMe: boolean;
  type: string;
  body: string;
  timestamp: number;
}
```

- [ ] **Step 4: Implement openwaWebhook.ts**

```ts
// src/webhooks/openwaWebhook.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import type { OpenWaInboundWebhook } from "./types.js";

export const openwaWebhookRouter = Router();

openwaWebhookRouter.post("/", async (req, res) => {
  const payload = req.body as OpenWaInboundWebhook;

  if (payload.fromMe) {
    return res.status(200).json({ ignored: true });
  }

  const conversation = await prisma.conversation.upsert({
    where: { waChatId: payload.chatId },
    create: { waChatId: payload.chatId },
    update: {}
  });

  const body = payload.type === "chat" ? payload.body : "[unsupported attachment]";

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "in",
      sender: "customer",
      body,
      waMessageId: payload.messageId
    }
  });

  res.status(200).json({ conversationId: conversation.id, mode: conversation.mode });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/webhooks/openwaWebhook.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add cockpit-backend/src/webhooks
git commit -m "feat: add OpenWA inbound webhook handler"
```

---

### Task 13: AI Auto-Reply Orchestration + Failure Handling

**Files:**
- Create: `cockpit-backend/src/ai/autoReply.ts`
- Modify: `cockpit-backend/src/webhooks/openwaWebhook.ts` (call `handleAutoReply` after logging an inbound message when `mode === "ai"`)
- Test: `cockpit-backend/src/ai/autoReply.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `LLMProvider` (Task 5), `sendWaMessage`/`OpenWaConfig` (Task 11)
- Produces: `handleAutoReply(conversationId: string, provider: LLMProvider, personaPrompt: string, waConfig: OpenWaConfig): Promise<void>` — on success, sends the reply via OpenWA and logs an outbound `Message` (`sender:"ai"`); on failure, sets `conversation.mode = "human"` and `needsAttention = true`, and does not throw (the webhook response must already have succeeded)

- [ ] **Step 1: Write the failing test**

```ts
// src/ai/autoReply.test.ts
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { prisma } from "../db/client.js";
import { handleAutoReply } from "./autoReply.js";
import type { LLMProvider } from "../llm/types.js";

const waConfig = { baseUrl: "http://openwa.local", apiKey: "key", sessionId: "sess-1" };

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("handleAutoReply", () => {
  it("sends the AI reply via OpenWA and logs it on success", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "1@c.us", mode: "ai" } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: "in", sender: "customer", body: "What are your hours?" }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.out.1" }) })
    );

    const provider: LLMProvider = { name: "fake", reply: vi.fn().mockResolvedValue("We're open 9-5, Mon-Fri.") };

    await handleAutoReply(convo.id, provider, "You are a helpful assistant.", waConfig);

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "asc" } });
    expect(messages).toHaveLength(2);
    expect(messages[1].sender).toBe("ai");
    expect(messages[1].body).toBe("We're open 9-5, Mon-Fri.");

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("ai");
    expect(updated?.needsAttention).toBe(false);
  });

  it("flips the conversation to human and flags needsAttention when the provider throws", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "2@c.us", mode: "ai" } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: "in", sender: "customer", body: "Hello?" }
    });

    const provider: LLMProvider = { name: "fake", reply: vi.fn().mockRejectedValue(new Error("timeout")) };

    await handleAutoReply(convo.id, provider, "You are a helpful assistant.", waConfig);

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("human");
    expect(updated?.needsAttention).toBe(true);

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id } });
    expect(messages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/autoReply.test.ts`
Expected: FAIL — `autoReply.ts` does not exist

- [ ] **Step 3: Implement autoReply.ts**

```ts
// src/ai/autoReply.ts
import { prisma } from "../db/client.js";
import type { LLMProvider, ChatMessage } from "../llm/types.js";
import { sendWaMessage, type OpenWaConfig } from "../openwa/client.js";

export async function handleAutoReply(
  conversationId: string,
  provider: LLMProvider,
  personaPrompt: string,
  waConfig: OpenWaConfig
): Promise<void> {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const priorMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 20
  });

  const history: ChatMessage[] = priorMessages.map((m) => ({
    role: m.direction === "in" ? "user" : "assistant",
    content: m.body
  }));

  try {
    const replyText = await provider.reply(history, personaPrompt);
    const sent = await sendWaMessage(waConfig, conversation.waChatId, replyText);
    await prisma.message.create({
      data: {
        conversationId,
        direction: "out",
        sender: "ai",
        body: replyText,
        waMessageId: sent.waMessageId
      }
    });
  } catch {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { mode: "human", needsAttention: true }
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/autoReply.test.ts`
Expected: PASS

- [ ] **Step 5: Wire it into the webhook handler**

Modify `src/webhooks/openwaWebhook.ts`: after creating the inbound `Message`, if `conversation.mode === "ai"`, call `handleAutoReply` (fire-and-forget is not acceptable — await it so failures are handled before responding, but do not let it block webhook ack past a reasonable time; for v1, await inline since OpenWA webhook delivery is not latency-sensitive to this level). Add the needed imports and call:

```ts
// src/webhooks/openwaWebhook.ts (additions)
import { handleAutoReply } from "../ai/autoReply.js";
import { resolveProvider } from "../llm/registry.js";
import { createDeepSeekProvider } from "../llm/providers/deepseek.js";
import { createClaudeProvider } from "../llm/providers/claude.js";
import { createOpenAIProvider } from "../llm/providers/openai.js";
import { createGoogleProvider } from "../llm/providers/google.js";

// after `await prisma.message.create(...)`, before the res.status(200) line:
if (conversation.mode === "ai") {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const provider = resolveProvider(settings, {
    deepseek: createDeepSeekProvider,
    claude: createClaudeProvider,
    openai: createOpenAIProvider,
    google: createGoogleProvider
  });
  await handleAutoReply(conversation.id, provider, settings.personaPrompt, {
    baseUrl: process.env.OPENWA_BASE_URL ?? "",
    apiKey: process.env.OPENWA_API_KEY ?? "",
    sessionId: process.env.OPENWA_SESSION_ID ?? ""
  });
}
```

- [ ] **Step 6: Re-run the webhook test suite to confirm nothing broke**

Run: `npx vitest run src/webhooks/openwaWebhook.test.ts`
Expected: PASS (existing tests don't hit the `mode === "ai"` branch's provider call because Task 12's tests either use `mode:"human"` or a fresh conversation defaults to `"ai"` — for the first test in Task 12's suite, this now also attempts an auto-reply; if that test starts failing because `resolveProvider` throws with no API key configured, update that specific test to first call `PUT /settings` with a fake key, or stub `fetch`, matching the pattern in Task 13's own tests)

- [ ] **Step 7: Commit**

```bash
git add cockpit-backend/src/ai cockpit-backend/src/webhooks/openwaWebhook.ts cockpit-backend/src/webhooks/openwaWebhook.test.ts
git commit -m "feat: wire AI auto-reply into inbound webhook with failure handoff"
```

---

### Task 14: Conversations Routes (List / Detail / Toggle Mode)

**Files:**
- Create: `cockpit-backend/src/routes/conversations.ts`
- Test: `cockpit-backend/src/routes/conversations.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `requireAuth` (Task 3)
- Produces: `conversationsRouter` — `GET /conversations` (list, newest-updated first), `GET /conversations/:id` (detail + messages), `PATCH /conversations/:id/mode` (body `{ mode: "ai" | "human" }`, clears `needsAttention` when set to `"human"` manually is NOT automatic — only setting `mode` explicitly; clearing `needsAttention` is a separate explicit action via the same PATCH accepting an optional `needsAttention: false`)

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/conversations.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { conversationsRouter } from "./conversations.js";

const app = express();
app.use(express.json());
app.use("/conversations", requireAuth(), conversationsRouter);

const token = signAgentToken({ agentId: "agent-1", role: "agent" });

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("conversations routes", () => {
  it("lists conversations newest-updated first", async () => {
    const older = await prisma.conversation.create({ data: { waChatId: "old@c.us" } });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.conversation.create({ data: { waChatId: "new@c.us" } });

    const res = await request(app).get("/conversations").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].waChatId).toBe("new@c.us");
    expect(res.body[1].waChatId).toBe("old@c.us");
    void older;
  });

  it("returns conversation detail with messages", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "detail@c.us" } });
    await prisma.message.create({ data: { conversationId: convo.id, direction: "in", sender: "customer", body: "hi" } });

    const res = await request(app).get(`/conversations/${convo.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("toggles mode via PATCH", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "toggle@c.us", mode: "ai" } });

    const res = await request(app)
      .patch(`/conversations/${convo.id}/mode`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "human" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("human");

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("human");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/conversations.test.ts`
Expected: FAIL — `conversations.ts` does not exist

- [ ] **Step 3: Implement conversations.ts**

```ts
// src/routes/conversations.ts
import { Router } from "express";
import { prisma } from "../db/client.js";

export const conversationsRouter = Router();

conversationsRouter.get("/", async (_req, res) => {
  const conversations = await prisma.conversation.findMany({ orderBy: { updatedAt: "desc" } });
  res.json(conversations);
});

conversationsRouter.get("/:id", async (req, res) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!conversation) return res.status(404).json({ error: "not found" });
  res.json(conversation);
});

conversationsRouter.patch("/:id/mode", async (req, res) => {
  const { mode, needsAttention } = req.body as { mode?: "ai" | "human"; needsAttention?: boolean };
  if (!mode || !["ai", "human"].includes(mode)) {
    return res.status(400).json({ error: "mode must be 'ai' or 'human'" });
  }
  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: { mode, ...(needsAttention !== undefined ? { needsAttention } : {}) }
  });
  res.json(updated);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/conversations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/routes/conversations.ts cockpit-backend/src/routes/conversations.test.ts
git commit -m "feat: add conversations list/detail/mode-toggle routes"
```

---

### Task 15: Messages Route (Agent Sends a Reply)

**Files:**
- Create: `cockpit-backend/src/routes/messages.ts`
- Test: `cockpit-backend/src/routes/messages.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `requireAuth` (Task 3), `sendWaMessage`/`OpenWaConfig` (Task 11)
- Produces: `messagesRouter` — `POST /conversations/:id/messages` (body `{ body: string }`; rejects with `409` if `conversation.mode !== "human"`; sends via OpenWA, logs `sender: "agent:<agentId>"`)

- [ ] **Step 1: Write the failing test**

```ts
// src/routes/messages.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createMessagesRouter } from "./messages.js";

const waConfig = { baseUrl: "http://openwa.local", apiKey: "key", sessionId: "sess-1" };
const app = express();
app.use(express.json());
app.use("/conversations", requireAuth(), createMessagesRouter(waConfig));

const token = signAgentToken({ agentId: "agent-42", role: "agent" });

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /conversations/:id/messages", () => {
  it("sends and logs an agent reply when mode is human", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "hm@c.us", mode: "human" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.agent.1" }) }));

    const res = await request(app)
      .post(`/conversations/${convo.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Sure, let me check that for you." });

    expect(res.status).toBe(201);
    expect(res.body.sender).toBe("agent:agent-42");

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("agent:agent-42");
  });

  it("rejects sending when mode is ai", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "ai@c.us", mode: "ai" } });

    const res = await request(app)
      .post(`/conversations/${convo.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Should be blocked" });

    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/messages.test.ts`
Expected: FAIL — `messages.ts` does not exist

- [ ] **Step 3: Implement messages.ts**

```ts
// src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { sendWaMessage, type OpenWaConfig } from "../openwa/client.js";

export function createMessagesRouter(waConfig: OpenWaConfig): Router {
  const router = Router();

  router.post("/:id/messages", async (req, res) => {
    const { body } = req.body as { body?: string };
    if (!body) return res.status(400).json({ error: "body is required" });

    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) return res.status(404).json({ error: "not found" });
    if (conversation.mode !== "human") {
      return res.status(409).json({ error: "conversation is not in human mode" });
    }

    const sent = await sendWaMessage(waConfig, conversation.waChatId, body);
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "out",
        sender: `agent:${req.agent!.agentId}`,
        body,
        waMessageId: sent.waMessageId
      }
    });
    res.status(201).json(message);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/messages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/routes/messages.ts cockpit-backend/src/routes/messages.test.ts
git commit -m "feat: add agent reply route, gated to human-mode conversations"
```

---

### Task 16: WebSocket Broadcast Hub

**Files:**
- Create: `cockpit-backend/src/ws/hub.ts`
- Test: `cockpit-backend/src/ws/hub.test.ts`

**Interfaces:**
- Consumes: `ws` package, an `http.Server` instance (constructed in Task 17)
- Produces:
  - `createWsHub(server: http.Server): { broadcast(event: { type: string; payload: unknown }): void }`

- [ ] **Step 1: Write the failing test**

```ts
// src/ws/hub.test.ts
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import WebSocket from "ws";
import { createWsHub } from "./hub.js";

let server: http.Server;

afterEach(() => {
  server?.close();
});

describe("createWsHub", () => {
  it("broadcasts events to all connected clients", async () => {
    server = http.createServer();
    const hub = createWsHub(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise((resolve) => client.on("open", resolve));

    const received = new Promise((resolve) => {
      client.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    hub.broadcast({ type: "new_message", payload: { conversationId: "abc" } });

    const message = await received;
    expect(message).toEqual({ type: "new_message", payload: { conversationId: "abc" } });
    client.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ws/hub.test.ts`
Expected: FAIL — `hub.ts` does not exist

- [ ] **Step 3: Implement hub.ts**

```ts
// src/ws/hub.ts
import type http from "node:http";
import { WebSocketServer } from "ws";

export interface WsEvent {
  type: string;
  payload: unknown;
}

export function createWsHub(server: http.Server): { broadcast(event: WsEvent): void } {
  const wss = new WebSocketServer({ server });

  return {
    broadcast(event: WsEvent) {
      const data = JSON.stringify(event);
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(data);
        }
      }
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ws/hub.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cockpit-backend/src/ws/hub.ts cockpit-backend/src/ws/hub.test.ts
git commit -m "feat: add WebSocket broadcast hub for live dashboard updates"
```

---

### Task 17: App Assembly + Server Entrypoint + Broadcast Wiring

**Files:**
- Create: `cockpit-backend/src/app.ts`
- Create: `cockpit-backend/src/server.ts`
- Modify: `cockpit-backend/src/webhooks/openwaWebhook.ts` (accept a `broadcast` callback, call it after logging inbound and after `handleAutoReply`)
- Modify: `cockpit-backend/src/routes/messages.ts` (accept a `broadcast` callback, call it after logging the agent's outbound message)
- Test: `cockpit-backend/src/app.test.ts`

**Interfaces:**
- Consumes: every router/module from Tasks 1–16
- Produces: `buildApp(deps: { waConfig: OpenWaConfig; broadcast: (e: WsEvent) => void }): express.Express` — assembled Express app with `GET /health`, mounted `/auth`, `/agents`, `/settings`, `/conversations`, `/webhooks/openwa`

- [ ] **Step 1: Update openwaWebhook.ts to accept and call broadcast**

Change `export const openwaWebhookRouter = Router();` to a factory, mirroring `createMessagesRouter`:

```ts
// src/webhooks/openwaWebhook.ts (signature change)
import type { WsEvent } from "../ws/hub.js";

export function createOpenwaWebhookRouter(broadcast: (e: WsEvent) => void): Router {
  const router = Router();
  router.post("/", async (req, res) => {
    // ...existing body...
    // after prisma.message.create(...):
    broadcast({ type: "new_message", payload: { conversationId: conversation.id } });
    // after the handleAutoReply(...) call inside the `if (conversation.mode === "ai")` block:
    broadcast({ type: "conversation_updated", payload: { conversationId: conversation.id } });
    // ...rest unchanged...
  });
  return router;
}
```

Update `src/webhooks/openwaWebhook.test.ts` to call `createOpenwaWebhookRouter(() => {})` instead of importing `openwaWebhookRouter` directly.

- [ ] **Step 2: Update messages.ts to accept and call broadcast**

```ts
// src/routes/messages.ts (signature change)
import type { WsEvent } from "../ws/hub.js";

export function createMessagesRouter(waConfig: OpenWaConfig, broadcast: (e: WsEvent) => void): Router {
  // ...existing body...
  // after prisma.message.create(...):
  broadcast({ type: "new_message", payload: { conversationId: conversation.id } });
  // ...rest unchanged...
}
```

Update `src/routes/messages.test.ts`'s `createMessagesRouter(waConfig)` call to `createMessagesRouter(waConfig, () => {})`.

- [ ] **Step 3: Write the failing app test**

```ts
// src/app.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  it("exposes a health check", async () => {
    const app = buildApp({
      waConfig: { baseUrl: "http://openwa.local", apiKey: "k", sessionId: "s" },
      broadcast: () => {}
    });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/app.test.ts`
Expected: FAIL — `app.ts` does not exist

- [ ] **Step 5: Implement app.ts**

```ts
// src/app.ts
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { agentsRouter } from "./routes/agents.js";
import { settingsRouter } from "./routes/settings.js";
import { conversationsRouter } from "./routes/conversations.js";
import { createMessagesRouter } from "./routes/messages.js";
import { createOpenwaWebhookRouter } from "./webhooks/openwaWebhook.js";
import { requireAuth } from "./middleware/requireAuth.js";
import type { OpenWaConfig } from "./openwa/client.js";
import type { WsEvent } from "./ws/hub.js";

export interface AppDeps {
  waConfig: OpenWaConfig;
  broadcast: (e: WsEvent) => void;
}

export function buildApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/agents", requireAuth(["admin"]), agentsRouter);
  app.use("/settings", requireAuth(["admin"]), settingsRouter);
  app.use("/conversations", requireAuth(), conversationsRouter);
  app.use("/conversations", requireAuth(), createMessagesRouter(deps.waConfig, deps.broadcast));
  app.use("/webhooks/openwa", createOpenwaWebhookRouter(deps.broadcast));

  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/app.test.ts`
Expected: PASS

- [ ] **Step 7: Implement server.ts**

```ts
// src/server.ts
import "dotenv/config";
import http from "node:http";
import { buildApp } from "./app.js";
import { createWsHub } from "./ws/hub.js";

const server = http.createServer();
const hub = createWsHub(server);

const app = buildApp({
  waConfig: {
    baseUrl: process.env.OPENWA_BASE_URL ?? "",
    apiKey: process.env.OPENWA_API_KEY ?? "",
    sessionId: process.env.OPENWA_SESSION_ID ?? ""
  },
  broadcast: (event) => hub.broadcast(event)
});

server.on("request", app);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`cockpit-backend listening on :${port}`));
```

- [ ] **Step 8: Run the full backend test suite**

Run: `cd cockpit-backend && npx vitest run`
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add cockpit-backend/src
git commit -m "feat: assemble Express app, entrypoint, and wire WebSocket broadcasts"
```

---

### Task 18: Dashboard Scaffold + Auth + Login Page

**Files:**
- Create: `cockpit-dashboard/package.json`
- Create: `cockpit-dashboard/vite.config.ts`
- Create: `cockpit-dashboard/tsconfig.json`
- Create: `cockpit-dashboard/index.html`
- Create: `cockpit-dashboard/src/main.tsx`
- Create: `cockpit-dashboard/src/App.tsx`
- Create: `cockpit-dashboard/src/api/client.ts`
- Create: `cockpit-dashboard/src/auth/AuthContext.tsx`
- Create: `cockpit-dashboard/src/pages/Login.tsx`
- Test: `cockpit-dashboard/src/pages/Login.test.tsx`

**Interfaces:**
- Produces:
  - `apiFetch(path: string, options?: RequestInit): Promise<Response>` — attaches `Authorization: Bearer <token>` from `localStorage`, prefixes `import.meta.env.VITE_API_URL`
  - `AuthProvider`, `useAuth(): { token: string | null; login(token: string): void; logout(): void }`
  - `<Login />` page component, posts to `/auth/login`, stores token via `useAuth().login`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cockpit-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts"
  }
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html and src/setupTests.ts**

```html
<!-- index.html -->
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Cockpit</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// src/setupTests.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Install dependencies**

Run: `cd cockpit-dashboard && npm install`
Expected: installs cleanly

- [ ] **Step 6: Implement api/client.ts**

```ts
// src/api/client.ts
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("cockpit_token");
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...options, headers });
}
```

- [ ] **Step 7: Implement auth/AuthContext.tsx**

```tsx
// src/auth/AuthContext.tsx
import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthValue {
  token: string | null;
  login(token: string): void;
  logout(): void;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("cockpit_token"));

  function login(newToken: string) {
    localStorage.setItem("cockpit_token", newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem("cockpit_token");
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 8: Write the failing Login test**

```tsx
// src/pages/Login.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { Login } from "./Login.js";

function TokenProbe() {
  const { token } = useAuth();
  return <div data-testid="token">{token ?? "none"}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Login page", () => {
  it("logs in and stores the token on successful submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt-abc" }) })
    );

    render(
      <AuthProvider>
        <Login />
        <TokenProbe />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("jwt-abc"));
  });

  it("shows an error message on invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid credentials" }) }));

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run src/pages/Login.test.tsx`
Expected: FAIL — `Login.tsx` does not exist

- [ ] **Step 10: Implement pages/Login.tsx**

```tsx
// src/pages/Login.tsx
import { useState, type FormEvent } from "react";
import { apiFetch } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "login failed");
      return;
    }
    login(data.token);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Log in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npx vitest run src/pages/Login.test.tsx`
Expected: PASS

- [ ] **Step 12: Implement App.tsx and main.tsx (routing shell, no dedicated test — covered by page tests)**

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { Login } from "./pages/Login.js";

function RequireToken({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireToken>
                <div>Chat list placeholder — replaced in Task 19</div>
              </RequireToken>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 13: Commit**

```bash
git add cockpit-dashboard
git commit -m "chore: scaffold cockpit-dashboard with auth context and login page"
```

---

### Task 19: Chat List Page

**Files:**
- Create: `cockpit-dashboard/src/pages/ChatList.tsx`
- Modify: `cockpit-dashboard/src/App.tsx` (replace placeholder route with `<ChatList />`, add `/chats/:id` route wired in Task 20)
- Test: `cockpit-dashboard/src/pages/ChatList.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 18)
- Produces: `<ChatList />` — fetches `GET /conversations`, renders each with mode badge and a `needsAttention` flag; each row links to `/chats/:id`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ChatList.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatList } from "./ChatList.js";

afterEach(() => vi.restoreAllMocks());

describe("ChatList", () => {
  it("renders conversations with mode badges and attention flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1", waChatId: "111@c.us", mode: "ai", needsAttention: false, updatedAt: "2026-08-17T00:00:00Z" },
          { id: "2", waChatId: "222@c.us", mode: "human", needsAttention: true, updatedAt: "2026-08-17T00:01:00Z" }
        ]
      })
    );

    render(
      <MemoryRouter>
        <ChatList />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("111@c.us")).toBeInTheDocument());
    expect(screen.getByText("222@c.us")).toBeInTheDocument();
    expect(screen.getAllByText(/needs attention/i)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/ChatList.test.tsx`
Expected: FAIL — `ChatList.tsx` does not exist

- [ ] **Step 3: Implement pages/ChatList.tsx**

```tsx
// src/pages/ChatList.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client.js";

interface ConversationSummary {
  id: string;
  waChatId: string;
  mode: "ai" | "human";
  needsAttention: boolean;
  updatedAt: string;
}

export function ChatList() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    apiFetch("/conversations")
      .then((res) => res.json())
      .then(setConversations);
  }, []);

  return (
    <ul>
      {conversations.map((c) => (
        <li key={c.id}>
          <Link to={`/chats/${c.id}`}>{c.waChatId}</Link>
          <span> [{c.mode}]</span>
          {c.needsAttention && <strong> needs attention</strong>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/ChatList.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into App.tsx**

Replace the placeholder route element in `src/App.tsx`'s `path="/"` with `<ChatList />`, importing it from `./pages/ChatList.js`.

- [ ] **Step 6: Commit**

```bash
git add cockpit-dashboard/src/pages/ChatList.tsx cockpit-dashboard/src/pages/ChatList.test.tsx cockpit-dashboard/src/App.tsx
git commit -m "feat: add chat list page"
```

---

### Task 20: Chat Detail Page

**Files:**
- Create: `cockpit-dashboard/src/pages/ChatDetail.tsx`
- Modify: `cockpit-dashboard/src/App.tsx` (add `/chats/:id` route)
- Test: `cockpit-dashboard/src/pages/ChatDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 18)
- Produces: `<ChatDetail />` — fetches `GET /conversations/:id`, renders message history, a mode toggle calling `PATCH /conversations/:id/mode`, and a reply form (enabled only when `mode === "human"`) posting to `POST /conversations/:id/messages`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ChatDetail.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChatDetail } from "./ChatDetail.js";

afterEach(() => vi.restoreAllMocks());

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/chats/${id}`]}>
      <Routes>
        <Route path="/chats/:id" element={<ChatDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ChatDetail", () => {
  it("disables the reply box while mode is ai and shows history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "1",
          waChatId: "111@c.us",
          mode: "ai",
          needsAttention: false,
          messages: [{ id: "m1", direction: "in", sender: "customer", body: "Hi there", createdAt: "2026-08-17T00:00:00Z" }]
        })
      })
    );

    renderAt("1");

    await waitFor(() => expect(screen.getByText("Hi there")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: /reply/i })).toBeDisabled();
  });

  it("sends a reply when mode is human", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/messages")) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "m2", body: "On it!" }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: "2",
          waChatId: "222@c.us",
          mode: "human",
          needsAttention: false,
          messages: []
        })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("2");

    const textbox = await screen.findByRole("textbox", { name: /reply/i });
    expect(textbox).toBeEnabled();

    fireEvent.change(textbox, { target: { value: "On it!" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/conversations/2/messages"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/ChatDetail.test.tsx`
Expected: FAIL — `ChatDetail.tsx` does not exist

- [ ] **Step 3: Implement pages/ChatDetail.tsx**

```tsx
// src/pages/ChatDetail.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api/client.js";

interface MessageRecord {
  id: string;
  direction: "in" | "out";
  sender: string;
  body: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  waChatId: string;
  mode: "ai" | "human";
  needsAttention: boolean;
  messages: MessageRecord[];
}

export function ChatDetail() {
  const { id } = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");

  async function load() {
    const res = await apiFetch(`/conversations/${id}`);
    setConversation(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  async function toggleMode() {
    if (!conversation) return;
    const nextMode = conversation.mode === "ai" ? "human" : "ai";
    await apiFetch(`/conversations/${id}/mode`, { method: "PATCH", body: JSON.stringify({ mode: nextMode }) });
    load();
  }

  async function sendReply() {
    if (!draft.trim()) return;
    await apiFetch(`/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body: draft }) });
    setDraft("");
    load();
  }

  if (!conversation) return <p>Loading…</p>;

  return (
    <div>
      <h2>{conversation.waChatId}</h2>
      <button onClick={toggleMode}>Mode: {conversation.mode} (click to toggle)</button>
      <ul>
        {conversation.messages.map((m) => (
          <li key={m.id}>
            <strong>{m.sender}:</strong> {m.body}
          </li>
        ))}
      </ul>
      <textarea
        aria-label="reply"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={conversation.mode !== "human"}
      />
      <button onClick={sendReply} disabled={conversation.mode !== "human"}>
        Send
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/ChatDetail.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the route into App.tsx**

Add `<Route path="/chats/:id" element={<RequireToken><ChatDetail /></RequireToken>} />` inside the `<Routes>` in `src/App.tsx`, importing `ChatDetail` from `./pages/ChatDetail.js`.

- [ ] **Step 6: Commit**

```bash
git add cockpit-dashboard/src/pages/ChatDetail.tsx cockpit-dashboard/src/pages/ChatDetail.test.tsx cockpit-dashboard/src/App.tsx
git commit -m "feat: add chat detail page with mode toggle and gated reply box"
```

---

### Task 21: Live-Update WebSocket Hook

**Files:**
- Create: `cockpit-dashboard/src/ws/useConversationSocket.ts`
- Modify: `cockpit-dashboard/src/pages/ChatList.tsx` (re-fetch on `new_message`/`conversation_updated` events)
- Modify: `cockpit-dashboard/src/pages/ChatDetail.tsx` (re-fetch when the event's `conversationId` matches the open chat)
- Test: `cockpit-dashboard/src/ws/useConversationSocket.test.tsx`

**Interfaces:**
- Consumes: none (wraps native `WebSocket`)
- Produces: `useConversationSocket(onEvent: (event: { type: string; payload: { conversationId: string } }) => void): void` — connects to `${import.meta.env.VITE_WS_URL}`, calls `onEvent` for every parsed message, cleans up the socket on unmount

- [ ] **Step 1: Write the failing test**

```tsx
// src/ws/useConversationSocket.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConversationSocket } from "./useConversationSocket.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("useConversationSocket", () => {
  it("invokes onEvent for incoming messages and closes on unmount", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const onEvent = vi.fn();

    const { unmount } = renderHook(() => useConversationSocket(onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.emit({ type: "new_message", payload: { conversationId: "abc" } });

    expect(onEvent).toHaveBeenCalledWith({ type: "new_message", payload: { conversationId: "abc" } });

    unmount();
    expect(socket.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ws/useConversationSocket.test.tsx`
Expected: FAIL — `useConversationSocket.ts` does not exist

- [ ] **Step 3: Implement useConversationSocket.ts**

```ts
// src/ws/useConversationSocket.ts
import { useEffect } from "react";

interface CockpitEvent {
  type: string;
  payload: { conversationId: string };
}

export function useConversationSocket(onEvent: (event: CockpitEvent) => void): void {
  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";
    const socket = new WebSocket(url);
    socket.onmessage = (e) => {
      onEvent(JSON.parse(e.data) as CockpitEvent);
    };
    return () => socket.close();
  }, [onEvent]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ws/useConversationSocket.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into ChatList.tsx**

Add inside `ChatList`, after the existing `useEffect`:

```tsx
import { useConversationSocket } from "../ws/useConversationSocket.js";
// ...
useConversationSocket(() => {
  apiFetch("/conversations").then((res) => res.json()).then(setConversations);
});
```

- [ ] **Step 6: Wire into ChatDetail.tsx**

Add inside `ChatDetail`, after the existing `useEffect`:

```tsx
import { useConversationSocket } from "../ws/useConversationSocket.js";
// ...
useConversationSocket((event) => {
  if (event.payload.conversationId === id) load();
});
```

- [ ] **Step 7: Commit**

```bash
git add cockpit-dashboard/src/ws cockpit-dashboard/src/pages/ChatList.tsx cockpit-dashboard/src/pages/ChatDetail.tsx
git commit -m "feat: add live WebSocket updates to chat list and chat detail"
```

---

### Task 22: Settings Page (Admin)

**Files:**
- Create: `cockpit-dashboard/src/pages/Settings.tsx`
- Modify: `cockpit-dashboard/src/App.tsx` (add `/settings` route)
- Test: `cockpit-dashboard/src/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 18)
- Produces: `<Settings />` — fetches `GET /settings`, form to change `activeProvider` (select: deepseek/claude/openai/google), per-provider API key inputs, persona prompt textarea; submits `PUT /settings`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/Settings.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Settings } from "./Settings.js";

afterEach(() => vi.restoreAllMocks());

describe("Settings page", () => {
  it("loads current settings and submits provider changes", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ activeProvider: "claude", personaPrompt: "New persona", hasDeepseekKey: true, hasClaudeKey: true, hasOpenaiKey: false, hasGoogleKey: false })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ activeProvider: "deepseek", personaPrompt: "Old persona", hasDeepseekKey: true, hasClaudeKey: false, hasOpenaiKey: false, hasGoogleKey: false })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Settings />);

    await waitFor(() => expect(screen.getByDisplayValue("Old persona")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/active provider/i), { target: { value: "claude" } });
    fireEvent.change(screen.getByLabelText(/persona prompt/i), { target: { value: "New persona" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/settings"),
        expect.objectContaining({ method: "PUT" })
      )
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Settings.test.tsx`
Expected: FAIL — `Settings.tsx` does not exist

- [ ] **Step 3: Implement pages/Settings.tsx**

```tsx
// src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

interface SettingsView {
  activeProvider: "deepseek" | "claude" | "openai" | "google";
  personaPrompt: string;
  hasDeepseekKey: boolean;
  hasClaudeKey: boolean;
  hasOpenaiKey: boolean;
  hasGoogleKey: boolean;
}

export function Settings() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch("/settings").then((res) => res.json()).then(setSettings);
  }, []);

  if (!settings) return <p>Loading…</p>;

  async function save() {
    const res = await apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({
        activeProvider: settings!.activeProvider,
        personaPrompt: settings!.personaPrompt,
        deepseekApiKey: keys.deepseek || undefined,
        claudeApiKey: keys.claude || undefined,
        openaiApiKey: keys.openai || undefined,
        googleApiKey: keys.google || undefined
      })
    });
    setSettings(await res.json());
  }

  return (
    <div>
      <label htmlFor="activeProvider">Active provider</label>
      <select
        id="activeProvider"
        value={settings.activeProvider}
        onChange={(e) => setSettings({ ...settings, activeProvider: e.target.value as SettingsView["activeProvider"] })}
      >
        <option value="deepseek">DeepSeek</option>
        <option value="claude">Claude</option>
        <option value="openai">OpenAI</option>
        <option value="google">Google</option>
      </select>

      {(["deepseek", "claude", "openai", "google"] as const).map((p) => (
        <div key={p}>
          <label htmlFor={`key-${p}`}>{p} API key</label>
          <input
            id={`key-${p}`}
            type="password"
            placeholder={settings[`has${p[0].toUpperCase()}${p.slice(1)}Key` as keyof SettingsView] ? "configured" : "not set"}
            value={keys[p] ?? ""}
            onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
          />
        </div>
      ))}

      <label htmlFor="personaPrompt">Persona prompt</label>
      <textarea
        id="personaPrompt"
        value={settings.personaPrompt}
        onChange={(e) => setSettings({ ...settings, personaPrompt: e.target.value })}
      />

      <button onClick={save}>Save</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/Settings.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into App.tsx**

Add `<Route path="/settings" element={<RequireToken><Settings /></RequireToken>} />`, importing `Settings` from `./pages/Settings.js`.

- [ ] **Step 6: Commit**

```bash
git add cockpit-dashboard/src/pages/Settings.tsx cockpit-dashboard/src/pages/Settings.test.tsx cockpit-dashboard/src/App.tsx
git commit -m "feat: add admin settings page for LLM provider and persona config"
```

---

### Task 23: Agents Page (Admin)

**Files:**
- Create: `cockpit-dashboard/src/pages/Agents.tsx`
- Modify: `cockpit-dashboard/src/App.tsx` (add `/agents` route)
- Test: `cockpit-dashboard/src/pages/Agents.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 18)
- Produces: `<Agents />` — fetches `GET /agents`, form to `POST /agents` (name/email/password/role), delete button calling `DELETE /agents/:id`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/Agents.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Agents } from "./Agents.js";

afterEach(() => vi.restoreAllMocks());

describe("Agents page", () => {
  it("lists agents and creates a new one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "2", name: "New Agent", email: "n@a.com", role: "agent" }) });
      }
      return Promise.resolve({ ok: true, json: async () => [{ id: "1", name: "Existing", email: "e@a.com", role: "admin" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Agents />);

    await waitFor(() => expect(screen.getByText("e@a.com")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "New Agent" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "n@a.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "pw123456" } });
    fireEvent.click(screen.getByRole("button", { name: /add agent/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/agents"), expect.objectContaining({ method: "POST" }))
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Agents.test.tsx`
Expected: FAIL — `Agents.tsx` does not exist

- [ ] **Step 3: Implement pages/Agents.tsx**

```tsx
// src/pages/Agents.tsx
import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

interface AgentRecord {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
}

export function Agents() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");

  function load() {
    apiFetch("/agents").then((res) => res.json()).then(setAgents);
  }

  useEffect(load, []);

  async function addAgent() {
    await apiFetch("/agents", { method: "POST", body: JSON.stringify({ name, email, password, role }) });
    setName("");
    setEmail("");
    setPassword("");
    load();
  }

  async function removeAgent(id: string) {
    await apiFetch(`/agents/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <ul>
        {agents.map((a) => (
          <li key={a.id}>
            {a.email} ({a.role}) <button onClick={() => removeAgent(a.id)}>Remove</button>
          </li>
        ))}
      </ul>

      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="email">Email</label>
      <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="role">Role</label>
      <select id="role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "agent")}>
        <option value="agent">Agent</option>
        <option value="admin">Admin</option>
      </select>
      <button onClick={addAgent}>Add agent</button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/Agents.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire into App.tsx**

Add `<Route path="/agents" element={<RequireToken><Agents /></RequireToken>} />`, importing `Agents` from `./pages/Agents.js`.

- [ ] **Step 6: Commit**

```bash
git add cockpit-dashboard/src/pages/Agents.tsx cockpit-dashboard/src/pages/Agents.test.tsx cockpit-dashboard/src/App.tsx
git commit -m "feat: add admin agents management page"
```

---

### Task 24: Dockerfiles + Docker Compose

**Files:**
- Create: `cockpit-backend/Dockerfile`
- Create: `cockpit-dashboard/Dockerfile`
- Create: `docker-compose.yml`
- Test: manual verification steps (no automated test — this task validates via `docker compose up`)

**Interfaces:**
- Consumes: both apps built in Tasks 1–23
- Produces: a `docker compose up` that starts Postgres, `cockpit-backend` (port 4000), `cockpit-dashboard` (port 5173, served via `vite preview` or a static server), networked so the backend can reach OpenWA via `OPENWA_BASE_URL`

- [ ] **Step 1: Write cockpit-backend/Dockerfile**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Write cockpit-dashboard/Dockerfile**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: cockpit
      POSTGRES_PASSWORD: cockpit
      POSTGRES_DB: cockpit
    volumes:
      - cockpit_pg_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  cockpit-backend:
    build: ./cockpit-backend
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://cockpit:cockpit@postgres:5432/cockpit
      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}
      OPENWA_BASE_URL: ${OPENWA_BASE_URL}
      OPENWA_API_KEY: ${OPENWA_API_KEY}
      OPENWA_SESSION_ID: ${OPENWA_SESSION_ID}
      PORT: 4000
    ports:
      - "4000:4000"

  cockpit-dashboard:
    build: ./cockpit-dashboard
    depends_on:
      - cockpit-backend
    ports:
      - "5173:5173"

volumes:
  cockpit_pg_data:
```

- [ ] **Step 4: Add a .env.example documenting required variables**

```
# .env.example
JWT_SECRET=replace-with-a-long-random-string
OPENWA_BASE_URL=http://your-openwa-host:port
OPENWA_API_KEY=your-openwa-api-key
OPENWA_SESSION_ID=your-openwa-session-id
```

- [ ] **Step 5: Verify the stack builds and boots**

Run: `docker compose build`
Expected: both images build without error

Run: `docker compose up -d postgres cockpit-backend`
Run: `docker compose exec cockpit-backend npx prisma migrate deploy`
Run: `curl http://localhost:4000/health`
Expected: `{"ok":true}`

Run: `docker compose up -d cockpit-dashboard`
Run: open `http://localhost:5173` in a browser
Expected: the login page renders

- [ ] **Step 6: Commit**

```bash
git add cockpit-backend/Dockerfile cockpit-dashboard/Dockerfile docker-compose.yml .env.example
git commit -m "chore: add Dockerfiles and docker-compose stack for cockpit"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Tasks 11, 12, 17), data model (Task 1), message flow AI/human/toggle (Tasks 12–15), LLM abstraction + 4 providers (Tasks 5–9), dashboard incl. roles/settings/agents (Tasks 18–23), error handling / needsAttention (Task 13), text-only/unsupported-attachment (Task 12), deployment (Task 24) — all covered.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an explicit shell command.
- **Type consistency:** `ChatMessage`, `LLMProvider`, `LLMProviderName` (Task 5) reused verbatim by Tasks 6–9, 13; `OpenWaConfig` (Task 11) reused by Tasks 13, 15, 17; `WsEvent` (Task 16) reused by Task 17's wiring and Task 21's frontend hook.
- **Known open item flagged, not hidden:** OpenWA's exact webhook/REST payload shape is a documented assumption confined to `src/openwa/client.ts` and `src/webhooks/types.ts` (Tasks 11–12), called out explicitly in Global Constraints and both tasks' preambles.
