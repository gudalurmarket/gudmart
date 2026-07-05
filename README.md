# GudMart — Community Organic Farmer Marketplace

A Progressive Web App that digitises the weekly operations of a community organic market in the **Gudalur–Ooty** region of Tamil Nadu.

Customers and farmers keep using **WhatsApp**. The system puts the operator in control.

---

## What this is

A small weekly market connects ~50 registered households with ~15–25 organic farmers. Today the operator manages everything manually: farmer availability and customer orders arrive on WhatsApp, stock is consolidated in Excel, and payments are tracked via UPI screenshots and cash.

This system replaces the spreadsheet without changing the habits of farmers or customers. It automates the high-friction operator steps — order triage, stock allocation, price-difference reconciliation, farmer payment tallies — while preserving the low-tech channels that already work.

| Actor | Scale | System access |
|---|---|---|
| Operator | 1–3 people | Full PWA dashboard |
| Volunteer | Variable (market day) | Packing & delivery screens only |
| Registered customer | ~50 | None — WhatsApp only |
| Outstation farmer | ~15 | None — WhatsApp only |
| Local farmer | ~5–10 | None — in person |

---

## Weekly lifecycle

Every market week moves through seven sequential states. Each state gates which actions are permitted.

```
setup → open → locked → delivery → market_day → reconciliation → closed
```

| State | Focus |
|---|---|
| **setup** | Create week, add produce list and prices |
| **open** | Customer orders arrive via WhatsApp; operator approves from intake queue |
| **locked** | Set buffers, assign orders to farmers, generate farmer-wise order sheets |
| **delivery** | Record what arrived; volunteers update per-order delivered quantities |
| **market_day** | Dispatch orders; record local farmer inbound and walk-in sales |
| **reconciliation** | Confirm price differences, record farmer payments |
| **closed** | Immutable weekly financial summary generated |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 (PWA) |
| Backend | Node.js 20 + Fastify 5 |
| Database | MongoDB Atlas M0 (Mongoose 9) |
| Auth | Firebase Authentication (JWT custom claims) |
| Hosting | Fly.io — single VM, Singapore region |
| Real-time | Server-Sent Events (native `EventSource`) |
| WhatsApp | Meta Cloud API — inbound webhook only |
| Styling | Tailwind CSS 3 |

**Hard MVP constraints:** no runtime AI, no payment gateway automation, no outbound WhatsApp API calls, free-tier services only, all money stored and computed as **integer paise** (₹1 = 100 paise).

---

## Repository structure

```
/
├── farmer-backend/          # Node.js + Fastify API
│   ├── server/
│   │   ├── app.js           # Fastify instance and plugin registration
│   │   ├── server.js        # Entry point
│   │   ├── config/          # DB and Firebase initialisation
│   │   ├── models/          # Mongoose schemas
│   │   ├── modules/
│   │   │   ├── walletEngine/     # Only code that writes wallet_balance
│   │   │   ├── stateMachine/     # State transition validator
│   │   │   ├── fcfsEngine.js     # FCFS stock allocation
│   │   │   ├── parser.js         # Rule-based WhatsApp message parser
│   │   │   ├── weeklySummaryAggregator.js
│   │   │   └── ...
│   │   ├── plugins/         # Fastify plugins (auth, state machine guard)
│   │   └── routes/          # All HTTP route handlers
│   └── tests/
│       ├── unit/
│       └── integration/
│
├── farmer-frontend/         # React PWA
│   └── src/
│       ├── operator/        # Lazy-loaded; operator role only
│       │   └── pages/       # Dashboard, WeekSetup, ProduceList, OrderIntake,
│       │                    # OrderManagement, WalletManagement, DeliveryManagement,
│       │                    # MarketDay, Reconciliation, WeeklySummary, Registrations
│       ├── volunteer/       # Lazy-loaded; volunteer role only
│       │   └── pages/       # InboundEntry, DeliveryEntry, PackingList, Dispatch
│       └── shared/          # Auth, hooks, API wrapper, translations, formatINR
│
├── scripts/                 # create-user, seed utilities
├── Dockerfile
├── fly.toml
├── ARCHITECTURE.md          # System design and component decisions
├── PRD.md                   # Full product requirements
├── process_map.md           # Weekly cycle by state and actor
├── interactions_flows.md    # Operator screen-by-screen flows
└── decisions.md             # Confirmed product decisions with rationale
```

---

## Key design rules

### 1. Paise-only arithmetic
All money is stored, passed, and computed as **integer paise**. The only division by 100 is in `formatINR()` inside `shared/lib/paise.js`, which is a display formatter — its output is never stored or used in calculations. Fastify schemas reject non-integer monetary fields at the API boundary.

### 2. WalletEngine is the sole wallet writer
`server/modules/walletEngine/` is the **only** code permitted to write `customers.wallet_balance` or insert `wallet_transactions` documents. No route handler or test bypasses this. The engine enforces the zero-floor constraint atomically.

### 3. State machine guard
`market_weeks.state` changes only via `PATCH /api/v1/weeks/:weekId/state`, enforced by the `stateMachineGuard` Fastify plugin. Each transition has gate conditions (e.g., `open → locked` requires zero orders in `pending_payment`). Gate failures return a `blockers` array, not a generic error, so the operator can navigate directly to each blocking item.

### 4. FCFS timestamp from WhatsApp
The first-come-first-served timestamp is taken from the WhatsApp message payload at webhook receipt — never `new Date()` server time. It is written to `InboundMessage.fcfs_timestamp` and copied to `CustomerOrder.fcfs_timestamp` at operator approval. It is the sort key for shortfall allocation.

### 5. Role-based access
Firebase custom claims (`operator` / `volunteer`). Volunteer access is an explicit allowlist in the `authVerify` plugin. The frontend enforces nothing the backend does not also enforce independently.

---

## Getting started

### Prerequisites

- Node.js 20+
- MongoDB Atlas account (or local MongoDB)
- Firebase project with a service account key (for JWT verification)
- Meta WhatsApp Business Cloud API app (for the inbound webhook)

### Backend

```sh
cd farmer-backend
npm install
cp .env.example .env
# Fill in MONGODB_URI, FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_JSON,
# WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN
npm run dev
```

Health check: `GET /health`

### Frontend

```sh
cd farmer-frontend
npm install
cp .env.development.example .env.development   # or .env.local
# Set VITE_API_URL and VITE_FIREBASE_* variables
npm run dev
```

### Create the first operator user

```sh
cd farmer-backend
node scripts/create-user.mjs operator your@email.com YourSecurePassword
```

This creates a Firebase user and sets the `operator` custom claim.

---

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `MONGODB_URI` | Backend | Atlas connection string (TLS) |
| `FIREBASE_PROJECT_ID` | Backend | JWT verification |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend | Base64-encoded service account JSON |
| `WHATSAPP_APP_SECRET` | Backend | HMAC verification of inbound webhooks |
| `WHATSAPP_VERIFY_TOKEN` | Backend | Meta webhook verification handshake |
| `PORT` | Backend | HTTP port (8080 in production) |
| `NODE_ENV` | Backend | `development` / `production` |
| `VITE_API_URL` | Frontend | Backend base URL |
| `VITE_FIREBASE_*` | Frontend | Firebase client SDK config |

Real values are **never** committed. See `.env.example` (backend) and `farmer-frontend/.env.development` (frontend) for the full list with placeholder values.

---

## Deployment

The application runs as a single Fly.io VM in Singapore (`sin` region). The Fastify server serves both the API (`/api/v1/`) and the built React bundle (static files).

```sh
# Build frontend, copy dist into backend, then deploy
cd farmer-backend && npm run copy-pwa
fly deploy
```

See `gudmart-manual-1-infrastructure-setup.md` and `gudmart-manual-2-platform-and-user-setup.md` for the full infrastructure setup guide.

---

## Tests

```sh
cd farmer-backend
npm test                      # all tests
npm run test:unit             # unit tests only
npm run test:integration      # integration tests (runs serially)
```

Integration tests use an in-memory MongoDB instance (`mongodb-memory-server`) and do not require a live Atlas connection.

---

## Reference documents

| Document | Contents |
|---|---|
| `PRD.md` | Full product requirements, data model, state gates |
| `ARCHITECTURE.md` | System components, auth, module contracts, deployment |
| `process_map.md` | Weekly operational cycle by actor and channel |
| `interactions_flows.md` | Step-by-step operator and volunteer screen flows |
| `decisions.md` | Confirmed product decisions with rationale |
| `CLAUDE.md` | Coding conventions and hard constraints (for AI-assisted development) |

---

## License

ISC
