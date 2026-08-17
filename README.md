# Cockpit

Cockpit is a WhatsApp AI + human-in-the-loop support backend and dashboard. Inbound WhatsApp
messages arrive via an [OpenWA](https://github.com/open-wa) webhook, are logged against a
conversation, and — while that conversation is in **AI mode** — get an automatic reply from a
configurable LLM provider (DeepSeek, Claude, OpenAI, or Google). A human agent can flip any
conversation to **human mode** from the React dashboard at any time (e.g. when the AI hands off a
conversation it can't handle, or an agent wants to intervene), at which point replies are sent
manually through the dashboard instead of by the AI. The system is two services — a Node/TS/Express
backend (`cockpit-backend/`) with a Postgres database via Prisma, and a React/Vite dashboard
(`cockpit-dashboard/`) — deployed together with Docker Compose.

## Prerequisites

- Docker and Docker Compose
- A running [OpenWA](https://github.com/open-wa) instance (or compatible WhatsApp gateway) that can
  POST inbound-message webhooks to this backend and accept outbound send requests
- An API key for at least one supported LLM provider: DeepSeek, Anthropic Claude, OpenAI, or Google

## Environment variables

Copy `.env.example` to `.env` in the repo root and fill in real values before bringing the stack up.

| Variable | Used by | Description |
| --- | --- | --- |
| `JWT_SECRET` | backend | Signs/verifies dashboard login tokens. Must be set — compose refuses to start without it. |
| `WEBHOOK_SECRET` | backend | Shared secret the OpenWA webhook caller must send in the `X-Webhook-Secret` header. Must be set — compose refuses to start without it. |
| `OPENWA_BASE_URL` | backend | Base URL of your OpenWA instance, used to send outbound WhatsApp messages. |
| `OPENWA_API_KEY` | backend | API key for your OpenWA instance. |
| `OPENWA_SESSION_ID` | backend | OpenWA session ID to send messages from. |
| `SEED_ADMIN_EMAIL` | backend (seed) | Email for the initial admin account created by the seed script. |
| `SEED_ADMIN_PASSWORD` | backend (seed) | Password for the initial admin account created by the seed script. |
| `VITE_API_URL` | dashboard (build) | Base URL the dashboard uses for HTTP API calls, e.g. `http://your-domain-or-ip:4000`. Baked in at build time. |
| `VITE_WS_URL` | dashboard (build) | WebSocket URL the dashboard uses for live updates, e.g. `ws://your-domain-or-ip:4000`. Baked in at build time. |

The backend also needs an LLM provider API key configured — this is set from the dashboard's Settings
page after you log in (Settings → API keys), not via an environment variable, since it's stored per
active provider in the database.

## Bringing the stack up

```bash
# 1. Configure environment
cp .env.example .env
# edit .env with real secrets and your OpenWA / dashboard URLs

# 2. Build and start everything (Postgres, backend, dashboard)
docker compose up -d

# 3. Wait for the backend to report healthy
docker compose ps
# cockpit-backend runs `prisma migrate deploy` automatically on container start,
# so the database schema is up to date once it's healthy.

# 4. Seed the initial admin account (one-time)
docker compose exec cockpit-backend node dist/seed.js

# 5. Log in
# Open the dashboard at http://localhost:5173 (or wherever VITE_API_URL/your reverse proxy
# points) and log in with SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
```

After first login, go to Settings to configure your LLM provider and API key, and to Agents to add
additional team members.

### Notes on seeding

The `seed` npm script (`tsx src/seed.ts`) only works against a checked-out source tree with
dependencies installed — it is not available inside the runtime Docker image, which only ships the
compiled `dist/` output. Use `docker compose exec cockpit-backend node dist/seed.js` as shown above;
it's safe to re-run (it skips creating the admin if `SEED_ADMIN_EMAIL` already exists).

### Webhook configuration

Point your OpenWA instance's inbound-message webhook at `http://<backend-host>:4000/webhooks/openwa`
and configure it to send the `X-Webhook-Secret` header with the value of `WEBHOOK_SECRET`. Requests
without a matching header are rejected with `401`.
