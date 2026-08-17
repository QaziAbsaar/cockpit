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
| `WEBHOOK_SECRET` | backend | HMAC-SHA256 secret shared with OpenWA's webhook registration (the `secret` field in [Registering the webhook](#3-register-the-webhook), 16+ chars). OpenWA signs every webhook delivery with it in `X-OpenWA-Signature: sha256=<hex>`; cockpit verifies the signature over the raw request body and rejects anything that doesn't match. Must be set — compose refuses to start without it. |
| `OPENWA_BASE_URL` | backend | Base URL of your OpenWA instance, used to send outbound WhatsApp messages. |
| `OPENWA_API_KEY` | backend | Scoped OpenWA API key for cockpit (see [Creating a scoped API key](#2-create-a-scoped-api-key-for-cockpit)) — `operator` role, restricted to `OPENWA_SESSION_ID` via `allowedSessions`. |
| `OPENWA_SESSION_ID` | backend | The **session UUID** OpenWA assigned when the session was created (`POST /api/sessions` → response `id`) — not the friendly `name` you chose for it. See [Creating a WhatsApp session](#1-create-a-whatsapp-session-in-openwa). |
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

### One-time OpenWA setup

Before cockpit can talk to a real OpenWA instance, do this once on the OpenWA side (its own
dashboard/admin API — not part of cockpit). These steps assume you already have an OpenWA instance
running and an **unscoped ADMIN** API key for it (the initial/bootstrap key OpenWA gives you on
first setup — session creation and API-key creation both require an unscoped key, so a
session-restricted key can't be used for these steps even if it's ADMIN-role).

#### 1. Create a WhatsApp session in OpenWA

Create a session and start it, then scan the QR code (via OpenWA's own dashboard, or `GET
/api/sessions/:sessionId/qr`) with the WhatsApp account you want cockpit to use:

```bash
curl -X POST http://<openwa-host>/api/sessions \
  -H "X-API-Key: <unscoped-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "cockpit" }'
# -> { "id": "8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a", "status": "created", ... }

curl -X POST http://<openwa-host>/api/sessions/8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a/start \
  -H "X-API-Key: <unscoped-admin-key>"
# status transitions initializing -> qr_ready; scan the QR, then it moves to authenticating -> ready
```

Poll `GET /api/sessions/:sessionId` until `status` is `ready` before continuing. The response's `id`
(a UUID, e.g. `8f3c2b1a-...`) is the value that becomes `OPENWA_SESSION_ID` below — not the `name`
you chose.

#### 2. Create a scoped API key for cockpit

Mint a least-privilege key for cockpit: `operator` role (enough to send messages and manage
webhooks; never give cockpit an `admin` key) and `allowedSessions` restricted to the one session
UUID from step 1, so this key can't touch any other session on the same OpenWA instance:

```bash
curl -X POST http://<openwa-host>/api/auth/api-keys \
  -H "X-API-Key: <unscoped-admin-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cockpit-backend",
    "role": "operator",
    "allowedSessions": ["8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a"]
  }'
# -> { "id": "...", "keyPrefix": "owa_k1_a1b2", "role": "operator",
#      "allowedSessions": ["8f3c2b1a-..."], "apiKey": "owa_k1_<64 hex>", ... }
```

The plaintext `apiKey` is only ever returned in this create response — copy it now. This becomes
`OPENWA_API_KEY` in cockpit's `.env`.

#### 3. Register the webhook

Point an OpenWA webhook at cockpit's inbound endpoint so it delivers `message.received` events
(genuinely inbound messages only — cockpit never has to filter out echoes of its own outbound
sends, since `message.sent` isn't in the subscribed `events` list):

```bash
curl -X POST http://<openwa-host>/api/sessions/8f3c2b1a-9d4e-4c7a-8b2f-1e6d5a4c3b2a/webhooks \
  -H "X-API-Key: owa_k1_<the operator key from step 2>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-cockpit-host/webhooks/openwa",
    "events": ["message.received"],
    "secret": "a-random-string-16-chars-or-longer"
  }'
```

`url` must be publicly reachable from OpenWA (registration runs an SSRF check against it). The
`secret` (16+ chars, required for OpenWA to sign deliveries at all — an unset secret means no
`X-OpenWA-Signature` header is ever sent, and cockpit rejects every request in that case) becomes
`WEBHOOK_SECRET` in cockpit's `.env` — **the same value on both sides**. OpenWA never returns the
plaintext `secret` again after creation, so save it alongside the API key from step 2.

With all three in place, cockpit's `.env` should have `OPENWA_BASE_URL` (OpenWA's base URL),
`OPENWA_API_KEY` (the key from step 2), `OPENWA_SESSION_ID` (the session UUID from step 1), and
`WEBHOOK_SECRET` (the secret from step 3) all filled in.
