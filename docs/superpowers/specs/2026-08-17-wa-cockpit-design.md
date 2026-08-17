# WhatsApp AI + Human-in-the-Loop Cockpit — Design

## Purpose

Business WhatsApp chatbot where AI handles conversations by default, and human
agents can take over any individual chat at will (and hand it back). Built on
top of the `rmyndharis/OpenWA` gateway rather than Meta's official Cloud API,
per explicit choice to avoid the official Meta middle-layer.

## Context: OpenWA

`OpenWA` (github.com/rmyndharis/OpenWA) is not a bare library — it's a
self-hosted NestJS gateway with its own React dashboard, multi-session WA
connections (whatsapp-web.js/baileys), webhooks, REST API, API-key auth, and
its own Postgres/SQLite storage. It is treated as an unmodified transport
layer: WhatsApp connection, session/QR management, message send/receive.

## Architecture

A new, independently deployable service — **cockpit** — sits beside OpenWA.
Integration boundary is OpenWA's webhook (inbound messages) and REST API
(outbound sends). OpenWA is not modified or forked.

```
WhatsApp <-> OpenWA (session, transport) --webhook--> cockpit-backend <-> Postgres
                ^                                          |
                |---------------- REST send API ------------|
                                                             |
                                                      cockpit-dashboard (React)
                                                      agents log in here
```

Rationale: keeps OpenWA upgradable/replaceable independent of the AI +
handoff logic. If OpenWA is ever swapped for another WA gateway, only the
webhook/REST adapter in cockpit-backend changes.

## Data Model (Postgres, owned by cockpit)

- **conversations**: `wa_chat_id`, `mode` (`ai` | `human`), `assigned_agent_id`,
  `needs_attention` (bool, set on AI failure), `updated_at`
- **messages**: `conversation_id`, `direction` (`in`/`out`), `sender`
  (`ai` | `agent:<id>` | `customer`), `body`, `wa_message_id`, `created_at`
- **agents**: `id`, `name`, `email`, `password_hash`, `role` (`admin` | `agent`)
- **settings**: singleton row — `active_provider`
  (`deepseek` | `claude` | `openai` | `google`), per-provider API key,
  system prompt / persona text

## Message Flow

1. Customer sends a WhatsApp message → OpenWA fires its webhook →
   cockpit-backend upserts the `conversations` row and inserts a `messages`
   row (`direction=in`, `sender=customer`).
2. **If `mode = ai`**: cockpit-backend calls the active LLM provider with the
   system prompt + recent conversation history, sends the reply via OpenWA's
   REST send API, and logs it (`direction=out`, `sender=ai`). The dashboard
   reflects this in near-real-time (websocket push) but the reply box stays
   read-only while `mode=ai`.
3. **If `mode = human`**: the inbound message is logged and pushed to the
   dashboard via websocket. An agent types a reply in the cockpit dashboard;
   cockpit-backend sends it via OpenWA's REST API and logs it
   (`direction=out`, `sender=agent:<id>`).
4. **Mode toggle**: an agent flips a per-chat switch in the dashboard, which
   updates `conversations.mode` immediately — no restart, no deploy.

## LLM Provider Abstraction

A single interface:

```
LLMProvider.reply(history: Message[], systemPrompt: string): Promise<string>
```

Four implementations — DeepSeek (default), Claude, OpenAI, Google — selected
at runtime by `settings.active_provider`. Switching providers or persona text
is a dashboard Settings change, not a code deploy or restart.

v1 uses a fixed system-prompt persona only — no RAG/knowledge-base retrieval.
That can be layered on later without changing this interface (history +
systemPrompt in, string out).

## Dashboard

React app. Agent login (email/password). Two roles:
- **admin**: manages agents, LLM provider/API keys, persona prompt
- **agent**: handles chats only

Views:
- **Chat list** — every conversation, mode badge (AI/Human), unread count,
  `needs_attention` flag surfaced prominently
- **Chat detail** — full history, mode toggle, reply box (enabled only when
  `mode=human`)
- **Settings** (admin only) — active LLM provider, API keys, persona prompt
- **Agents** (admin only) — add/remove team members, set roles

## Deployment

Docker Compose: `cockpit-backend`, `cockpit-dashboard`, `postgres`, deployed
alongside OpenWA's own compose stack (networked together, e.g. via a shared
Docker network or separate compose files). Hosting target (VPS vs local) is
not decided yet — the design stays deployment-agnostic; Docker is the only
requirement.

## Error Handling

If an LLM call fails or times out: the inbound customer message is never
silently dropped. The conversation's `mode` is force-flipped to `human` and
`needs_attention=true` is set, surfaced as a flag in the dashboard chat list.
The customer receives no broken/partial AI reply.

## Message Types (v1 scope)

Text-only. Incoming media (images, voice, documents) is stored as an
"[unsupported attachment]" placeholder message for a human to handle
manually. Vision/media support is an explicit non-goal for v1.

## Testing

- Backend: unit tests for the LLM provider abstraction (mocked API
  responses) and the webhook handler's mode-branching logic (ai vs human vs
  failure path).
- No automated end-to-end WhatsApp test (requires a live WA session) —
  manual smoke test against a real OpenWA sandbox session before go-live.

## Explicit Non-Goals (v1)

- RAG / knowledge-base-grounded answers
- Media/voice/image handling
- Multiple WhatsApp numbers / multi-tenant
- Chat command-based mode switching (dashboard toggle only)
