# Gudalur B2C Farmer Marketplace — Backend

Operator-first API for a community organic market in the **Gudalur–Ooty** region. The system digitises weekly operator workflows while customers and farmers keep using **WhatsApp** — they are not system users in MVP.

> **Automate high-impact operator actions. Preserve low-impact manual habits.**

---

## Background

A weekly community market runs with roughly:

| Actor | Scale |
|-------|--------|
| Registered customers | ~50 |
| Outstation farmers | ~15 |
| Local farmers | ~5–10 |
| Operators | 1–3 |
| Volunteers | Variable (market day) |

Today everything is manual: farmer availability and customer orders arrive on WhatsApp, the operator consolidates in Excel, and payments are tracked via UPI screenshots and cash. This backend supports moving that burden into a structured system without changing how customers and farmers communicate.

---

## What this repository is

This folder is the **Node.js + Fastify** API layer for the full product described in `PRD.md`, `ARCHITECTURE.md`, and `context_v4.md`. A separate React PWA (operator + volunteer) will call this API.

**Implemented in this repo (work in progress):**

- MongoDB models for customers, farmers, market weeks, orders, wallet, inbound messages, and related entities
- WhatsApp webhook ingestion (`GET` / `POST /webhook/whatsapp`)
- Rule-based inbound message parsing
- Inbound order queue (pending / approve / reject)
- Order creation from approved inbound messages
- Stock allocation service (`POST /allocation/run/:week_id`)
- Market week state machine and wallet service (foundational modules)

**Planned (see product docs):** full `/api/v1` routes, Firebase JWT auth, state machine guard plugin, WalletEngine-only writes, FCFS engine, SSE intake queue, Fly.io deployment, and complete week lifecycle APIs.

---

## Actors and access

| Actor | System access | Channel |
|-------|---------------|---------|
| **Operator** | Full PWA (planned) | Dashboard |
| **Volunteer** | Packing / delivery only (planned) | Mobile PWA |
| **Registered customer** | None | WhatsApp → operator |
| **Farmers** | None | WhatsApp → operator |
| **Walk-in customer** | None | In person |

Customers and farmers never log in. The operator is the centre of gravity for all confirmations, payments, and state changes.

---

## Weekly market lifecycle

The market week moves through seven sequential states. Each state gates which actions are allowed.

```
setup → open → locked → delivery → market_day → reconciliation → closed
```

| State | Typical focus |
|-------|----------------|
| **setup** | Create week, enter produce list and prices |
| **open** | Customer orders, wallet top-ups, confirm/cancel orders |
| **locked** | Buffers, farmer assignments, consolidated farmer orders |
| **delivery** | Arrival quantities, packing, volunteer updates |
| **market_day** | Dispatch, local farmer inbound, walk-in sales |
| **reconciliation** | Price differences, farmer payments |
| **closed** | Weekly financial summary (immutable) |

See `process_map.md` for the full to-be process by actor and channel.

---

## Order intake (MVP decision)

**Semi-automated with operator confirmation** (Decision 1 in `decisions.md`):

1. Customer sends a free-form WhatsApp order (unchanged habit).
2. Meta Cloud API delivers the message to the webhook.
3. **FCFS timestamp** is taken from the WhatsApp payload at receipt — never server time.
4. A **rule-based parser** (no AI) extracts product, quantity, and unit.
5. The operator reviews, edits if needed, and approves in the intake queue.
6. A confirmed order debits the customer wallet (integer **paise** only).

Voice notes and ambiguous text are flagged for manual entry. Tamil/English variants use a synonym table, not runtime translation.

---

## Technology stack

Aligned with `ARCHITECTURE.md` and project decisions:

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 |
| API | Fastify |
| Database | MongoDB Atlas (Mongoose) |
| Auth | Firebase Authentication (Admin SDK) |
| WhatsApp | Meta Cloud API (inbound webhook) |
| Hosting (target) | Fly.io, Singapore region |
| Real-time (target) | Server-Sent Events (not WebSockets) |

**Hard MVP constraints:** no runtime AI, no payment gateway automation, no outbound WhatsApp API, free-tier services only, all money in **integer paise** (₹1 = 100 paise).

---

## Project structure

```
farmer-backend/
├── server/
│   ├── app.js                 # Fastify entrypoint
│   ├── config/                # DB, Firebase
│   ├── models/                # Mongoose schemas
│   ├── modules/
│   │   ├── whatsapp/          # Webhook pipeline
│   │   ├── parser/            # Rule-based message parser
│   │   └── allocation/        # Stock allocation
│   ├── routes/                # HTTP routes
│   └── services/              # Wallet, market week state machine
├── tests/
│   └── unit/
├── specs/                     # B1 schema, B2 wallet & state machine specs
├── scripts/                   # (seed / utilities — to be added)
├── PRD.md                     # Product requirements
├── ARCHITECTURE.md            # System architecture
├── context_v4.md              # Single reference context
├── decisions.md               # Confirmed product decisions
├── process_map.md             # Weekly process by state
└── interactions_flows.md      # Operator UI flows
```

---

## Getting started

### Prerequisites

- Node.js 20+
- MongoDB Atlas (or local MongoDB)
- Firebase project with service account (for auth when wired)
- WhatsApp Business Cloud API app (for webhook)

### Install and run

```sh
cd farmer-backend
npm install
cp .env.example .env
# Edit .env with your values (never commit .env)
npm run dev
```

Default port is `3000` (or `PORT` from `.env`). Health check: `GET /health`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (8080 in production per Fly.io) |
| `MONGODB_URI` | MongoDB connection string |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Base64 service account JSON **or** use `server/config/serviceAccountKey.json` locally (gitignored) |
| `WHATSAPP_APP_SECRET` | HMAC verification for webhooks |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification handshake |
| `NODE_ENV` | `development` / `production` |

---

## API routes (current)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health |
| `GET` | `/webhook/whatsapp` | Meta webhook verification |
| `POST` | `/webhook/whatsapp` | Inbound WhatsApp messages |
| `GET` | `/inbound/pending` | Pending intake queue (FCFS sort) |
| `PATCH` | `/inbound/:message_id/approve` | Approve parsed message |
| `PATCH` | `/inbound/:message_id/reject` | Reject message |
| `POST` | `/orders/from-inbound/:message_id` | Create order from approved inbound |
| `POST` | `/allocation/run/:week_id` | Run stock allocation for a week |

Target base path for the full API: `/api/v1/` (see `ARCHITECTURE.md`).

---

## Core design rules

These are non-negotiable across the full codebase (see `CLAUDE.md` in the monorepo root):

1. **Paise-only arithmetic** — store and compute money as integers; divide by 100 only for display.
2. **WalletEngine** — the only module that may write `wallet_balance` or `wallet_transactions`.
3. **State machine guard** — `market_weeks.state` changes only via validated transitions.
4. **FCFS timestamp** — from WhatsApp message time at webhook receipt; copied to orders at confirmation.
5. **Immutability** — wallet transactions and several order fields are write-once after creation.

Database field-level detail: `specs/B1-database-schema.md`. Wallet and state machine behaviour: `specs/B2-wallet-engine.md`, `specs/B2-state-machine.md`.

---

## Reference documents

Read in this order when implementing features:

1. `context_v4.md` — background, actors, workflows, constraints  
2. `decisions.md` — confirmed choices (order intake, customer queries, etc.)  
3. `PRD.md` — functional requirements and data model  
4. `ARCHITECTURE.md` — components, auth, deployment  
5. `process_map.md` — weekly cycle by state and actor  
6. `interactions_flows.md` — operator screen flows  

---

## License

ISC (see `package.json`).
