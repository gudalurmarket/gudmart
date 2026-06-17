# B2C Farmer Marketplace — Architecture Document

**Version:** 1.0
**Status:** Implementation-Ready
**Last Updated:** April 2026
**Depends On:** context_v4.md · decisions.md · process_map.md · interactions_flows.md v1.1 · PRD.md v1.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [WhatsApp Integration Architecture](#5-whatsapp-integration-architecture)
6. [Database Schema Mapping](#6-database-schema-mapping)
7. [Authentication and Authorisation](#7-authentication-and-authorisation)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Data Integrity and Audit Trail](#9-data-integrity-and-audit-trail)
10. [Non-Functional Requirement Mapping](#10-non-functional-requirement-mapping)
11. [Risk Register](#11-risk-register)
12. [Out of Scope for MVP Architecture](#12-out-of-scope-for-mvp-architecture)
13. [Open Items](#13-open-items)

---

## 1. Architecture Overview

### 1.1 Plain-Language Summary

The system is a single Progressive Web Application served from one domain, with role-based routing to separate the operator dashboard from the volunteer mobile view. It is backed by a Node.js (Fastify) REST API that enforces the seven-state week lifecycle, executes all wallet transaction logic in integer paise, and hosts the WhatsApp message webhook. All data is stored in MongoDB Atlas (free tier). Authentication is handled by Firebase Auth (free tier). The PWA frontend, API backend, and webhook endpoint are all co-hosted on Fly.io (free tier) as a single always-on service, which resolves the spin-down problem for the webhook.

The key principle governing the architecture is that all intelligence lives server-side. The state machine, wallet constraints, FCFS timestamp capture, rule-based parser, and all financial calculations are enforced at the API layer. The PWA is a display and input surface only — it cannot bypass server-enforced gates.

### 1.2 Component Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                │
│                                                                    │
│  ┌──────────────────────────┐  ┌───────────────────────────────┐  │
│  │   Operator PWA           │  │   Volunteer PWA               │  │
│  │   /operator/* routes     │  │   /volunteer/* routes         │  │
│  │   React + Vite           │  │   React + Vite (lazy-loaded)  │  │
│  │   Desktop / Tablet       │  │   Mobile, 2G/3G               │  │
│  │   No offline required    │  │   Service Worker (form cache) │  │
│  └─────────────┬────────────┘  └──────────────┬────────────────┘  │
└────────────────┼──────────────────────────────┼────────────────────┘
                 │  HTTPS REST (JWT Bearer)      │
┌────────────────┼──────────────────────────────┼────────────────────┐
│                        API LAYER (Fly.io VM)                       │
│                                                                    │
│  ┌─────────────▼──────────────────────────────▼────────────────┐  │
│  │              Fastify REST API (Node.js)                      │  │
│  │                                                              │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                  │  │
│  │  │  State Machine  │  │  Wallet Engine   │                  │  │
│  │  │  Enforcement    │  │  (paise integer) │                  │  │
│  │  └─────────────────┘  └──────────────────┘                  │  │
│  │                                                              │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                  │  │
│  │  │  Rule-Based     │  │  FCFS Allocation │                  │  │
│  │  │  Parser Module  │  │  Engine          │                  │  │
│  │  └─────────────────┘  └──────────────────┘                  │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐    │  │
│  │  │  WhatsApp Webhook Receiver (POST /webhook/whatsapp) │    │  │
│  │  │  — always-on, co-hosted in same process             │    │  │
│  │  └─────────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼──────┐   ┌──────────▼──────┐   ┌─────────▼───────┐
│  MongoDB      │   │  Firebase Auth  │   │  WhatsApp       │
│  Atlas        │   │  (free tier)    │   │  Business API   │
│  (free tier)  │   │  Token verify   │   │  Cloud API      │
│  M0 cluster   │   └─────────────────┘   │  (Meta-hosted)  │
└───────────────┘                         └─────────────────┘
```

### 1.3 Data Flow Summary

**Inbound WhatsApp message path:**
```
Customer WhatsApp message
  → Meta Cloud API
  → POST /webhook/whatsapp (Fastify, always-on)
  → FCFS timestamp captured from API payload
  → Rule-based parser invoked
  → InboundMessage document written to MongoDB
  → Server-Sent Event pushed to operator intake queue
  → Operator reviews and approves in PWA
  → CustomerOrder created; wallet debited; FCFS timestamp set
```

**Operator state transition path:**
```
Operator taps action in PWA
  → REST call to API with JWT
  → Fastify: JWT verified → role checked → week state checked
  → Business logic executed (wallet, FCFS allocation, etc.)
  → MongoDB documents written (immutably)
  → Response returned to PWA
```

---

## 2. Technology Stack

### 2.1 Selected Stack

| Layer | Technology | Provider | Free-Tier Limits Relevant to MVP |
|---|---|---|---|
| Frontend framework | React 18 + Vite | Self-hosted on Fly.io (served as static files from the API server) | No separate limit — served from API VM |
| Backend framework | Node.js 20 + Fastify 4 | Fly.io | 3 shared-CPU VMs, 256MB RAM each, 160GB outbound/month |
| Database | MongoDB Atlas M0 | MongoDB Atlas | 512MB storage, shared cluster, no dedicated ops |
| Authentication | Firebase Authentication | Google Firebase | 10,000 auth events/month, unlimited email/password |
| WhatsApp API | Cloud API (Meta-hosted) | Meta Business Platform | Free to receive; per-message cost for outbound (MVP sends zero outbound messages — operator copies and pastes) |
| Webhook hosting | Co-hosted in Fastify process | Fly.io (same VM as API) | No additional cost — same VM |
| Real-time updates | Server-Sent Events (SSE) | Fly.io (same VM) | No additional limit |

### 2.2 Justification by Layer

**React + Vite over Next.js or SvelteKit:**
Next.js server-side rendering adds complexity and an additional runtime for no benefit — the PWA does not need SSR. SvelteKit produces smaller bundles than React but the ecosystem is smaller and the team would need to context-switch from a JS-standard toolchain. Vite's build produces aggressively code-split bundles; volunteer routes are lazy-loaded and never downloaded to the operator and vice versa. React is the lowest-friction choice for a 1–2 person team.

**Fastify over Express:**
Fastify is measurably faster than Express on cold paths (relevant for the webhook receiver on first request after any idle period) and has built-in schema validation via JSON Schema, which enforces the paise-integer contract at the API boundary without additional middleware. Express would work but Fastify is the better default for a new project.

**MongoDB Atlas over Firestore or Supabase:**
Firestore's real-time listener capability is attractive for the operator intake queue but comes at a cost: its free-tier Spark plan caps at 50,000 document reads/day and 20,000 writes/day. At MVP scale this is fine, but Firestore's pricing cliff on the paid tier is steep. MongoDB Atlas M0 (free tier) offers 512MB storage — adequate for indefinite retention of ~50 customers × 52 weeks — and supports Server-Sent Events as the real-time mechanism from the API layer, which removes the Firestore listener dependency. MongoDB's document model maps naturally to the PRD data model. Supabase (PostgreSQL) is relational, which would require an ORM and schema migrations — unnecessary overhead for a 1–2 person MVP team when the PRD explicitly specifies a document-oriented NoSQL model.

**Firebase Auth over Supabase Auth or custom JWT:**
Firebase Auth free tier supports 10,000 authentication events per month — vastly more than needed for 1–3 operators and a handful of volunteers. It provides email/password authentication, token refresh, and a well-documented verification SDK for Node.js. Supabase Auth is comparable but introduces a second provider dependency (Supabase database + auth vs. MongoDB Atlas + Firebase Auth). Custom JWT implementation would require secret rotation management and a user store — unnecessary scope for MVP.

**Fly.io over Render or Railway:**
Render's free tier spins down after 15 minutes of inactivity, which is incompatible with the always-on webhook requirement. Railway's free tier has changed repeatedly and currently offers a $5 credit per month — not a stable zero-cost guarantee. Fly.io offers 3 permanently-running shared-CPU VMs at no cost with no spin-down behaviour, provided the VM stays within resource limits. This is the only free-tier host with a credible always-on guarantee as of early 2026.

**Server-Sent Events over WebSockets or polling:**
WebSockets require a persistent bidirectional connection; Fly.io's free-tier proxy supports long-lived HTTP connections but WebSocket upgrade behaviour on shared VMs can be unreliable. SSE is unidirectional (server to client), uses standard HTTP, and is natively supported in all modern browsers including Android Chrome on low-end devices. For the operator intake queue — which only needs server-to-client push of new messages — SSE is sufficient and more reliable than WebSockets in this environment. Polling at 5-second intervals is the fallback if SSE fails, but SSE should be the default.

---

## 3. Frontend Architecture

### 3.1 PWA Structure

The PWA is a single React application served from the Fly.io VM. Vite handles the build with code splitting. Both operator and volunteer experiences are in the same codebase and served from the same domain, with role-based routing enforced at the application layer (backed by API token verification).

```
/src
  /operator          ← lazy-loaded chunk; only downloaded by operator role
    /pages
      Dashboard.jsx
      WeekSetup.jsx
      ProduceList.jsx
      OrderIntake.jsx
      WalletManagement.jsx
      DeliveryManagement.jsx
      MarketDay.jsx
      Reconciliation.jsx
      WeeklySummary.jsx
      Registrations.jsx
    /components
      StateMachineBadge.jsx
      WalletLedger.jsx
      OrderCard.jsx
      ParsedMessagePreview.jsx
      IntakeQueue.jsx
      ...
  /volunteer         ← lazy-loaded chunk; only downloaded by volunteer role
    /pages
      DeliveryEntry.jsx
      PackingList.jsx
      Dispatch.jsx
    /components
      DeliveryItemRow.jsx
      PackingOrderCard.jsx
      DispatchOrderCard.jsx
  /shared
    /components      ← downloaded by both roles
      Layout.jsx
      NavBar.jsx
      ErrorBoundary.jsx
      LoadingSpinner.jsx
    /hooks
      useAuth.js
      useWeekState.js
      useSSE.js
    /lib
      api.js         ← fetch wrapper with JWT injection
      constants.js
      paise.js       ← INR ↔ paise conversion utilities
  /service-worker    ← volunteer-only offline form state
  App.jsx
  main.jsx
```

### 3.2 Routing and Role Separation

React Router v6 handles all routing. On load, the app fetches the current user's role from the JWT claims (set at login by Firebase Auth). A `ProtectedRoute` wrapper redirects unauthenticated users to `/login` and sends each role to its correct root path:

```
/login                        → public; redirects on success by role
/operator/*                   → operator role only; lazy-loaded
/volunteer/*                  → volunteer role only; lazy-loaded
/                             → redirects to /operator or /volunteer based on role
```

If a volunteer attempts to access an `/operator/*` route (or vice versa), the `ProtectedRoute` wrapper redirects to the correct root. This is a UI-layer convenience only — the API enforces role access independently on every request.

**Operator entry point:** `/operator/dashboard` — shows current week state, pending intake queue count, and quick action links for the current state.

**Volunteer entry point:** `/volunteer/delivery` (in Delivery state) or `/volunteer/dispatch` (in Market Day state). The volunteer sees a state-appropriate landing screen; screens not relevant to the current week state are hidden from navigation but still routed for direct-link access with a "Not available in current week state" message.

### 3.3 Operator PWA Details

**Device target:** Laptop or tablet, minimum 768px viewport, modern browser. No mobile layout required for operator screens.

**Language toggle:** Static Tamil/English toggle in the header. Selection stored in `localStorage`. All UI labels, button text, error messages, and generated WhatsApp message templates exist as static translation objects keyed by string ID. No runtime translation — all strings are pre-translated at build time.

**State machine visibility:** Every operator screen shows the current week state as a persistent badge. Action buttons not available in the current state are either hidden or disabled with a tooltip explaining why.

**Intake queue real-time update:** The operator intake queue screen opens an SSE connection to `GET /api/events/intake-queue`. When a new InboundMessage is written to MongoDB, the API pushes a `new-message` event. The queue updates without page refresh. SSE reconnects automatically on disconnect (browser `EventSource` API handles this natively).

**Bundle size:** Operator chunk will be larger than the volunteer chunk due to the breadth of screens. Acceptable — the operator is on standard broadband and the initial load is cached by the PWA manifest after first visit.

### 3.4 Volunteer PWA Details

**Device target:** Low-end Android 8+, mobile-optimised, touch targets minimum 44px, no pinch-zoom required for core actions.

**Performance budget:** Under 100KB per screen after first visit (service worker cached). No images, no heavy assets, no chart libraries on volunteer screens.

**Service Worker — Offline Form State:**

The service worker is scoped to volunteer routes only (`/volunteer/*`). It implements the following caching strategy:

1. **App shell (precache):** On install, the service worker precaches the volunteer chunk JS/CSS, the shared chunk, and the app manifest. These are served from cache-first on subsequent loads — the volunteer screen loads instantly even on a cold connection.

2. **API responses (network-first with fallback):** For data fetches (packing list, delivery items), the service worker attempts network first. If the network fails, it serves the last cached API response for that endpoint. The volunteer can still view the packing list from the last successful fetch.

3. **Offline form state (IndexedDB queue):** Delivery quantity entries that cannot be synced immediately (due to connectivity loss) are written to an IndexedDB store keyed by `{weekId}:{productId}`. On reconnection, the service worker's background sync fires and sends the queued entries to the API in the order they were entered. Duplicate protection: the API checks if a delivered quantity entry for the same `{weekId, productId}` already exists and applies an idempotency key on the request. If the sync fails again, the entry remains in the queue until the next reconnection.

4. **Conflict resolution:** If the volunteer submits a quantity, loses connectivity, and the operator also edits the same quantity during the offline period, the API applies last-write-wins for operator edits (operator edits carry an explicit `overrideVolunteer: true` flag). When the volunteer's queued entry syncs, if an operator edit for the same item has a later timestamp, the volunteer's sync is accepted as a no-op and the volunteer sees the operator's value on next load.

**Offline indicator:** A banner ("You are offline — changes will sync when connectivity returns") is displayed when `navigator.onLine` is false.

### 3.5 Bundle Size Strategy

| Chunk | Estimated Size (gzipped) | Who Downloads |
|---|---|---|
| Shared (layout, hooks, lib) | ~30KB | Both roles, on first load |
| Volunteer chunk | ~40KB | Volunteer only |
| Operator chunk | ~150KB | Operator only |
| React runtime | ~45KB | Both roles, cached after first load |

Volunteer total first-meaningful-paint payload: ~115KB (shared + volunteer + React). Well within the 100KB per-screen budget after the first load (service worker cache eliminates the React runtime re-download on subsequent visits).

The operator chunk size of ~150KB is acceptable on standard broadband. It is not cached for offline use, which is acceptable since the PRD does not require offline capability for the operator.

---

## 4. Backend Architecture

### 4.1 API Design

The API is REST. GraphQL is not used — the data access patterns are straightforward and well-defined by the PRD, the team is 1–2 developers, and GraphQL's schema overhead buys no benefit at this scale.

**Base URL:** `https://<fly-app>.fly.dev/api/v1`

**Authentication:** All routes except `/auth/verify` and `/webhook/whatsapp` require a `Authorization: Bearer <firebase-id-token>` header. The Fastify JWT plugin verifies the token against Firebase's public keys on every request.

**Route structure:**

```
POST   /auth/verify              — verifies Firebase token, returns role claim
GET    /weeks                    — list of all weeks (operator)
POST   /weeks                    — create new week (operator)
GET    /weeks/:weekId            — week detail (both roles)
PATCH  /weeks/:weekId/state      — state transition (operator only)
GET    /weeks/:weekId/produce    — produce list (both roles)
POST   /weeks/:weekId/produce    — add produce item (operator, Setup/Open states)
PATCH  /weeks/:weekId/produce/:itemId — edit produce item (operator)
GET    /weeks/:weekId/orders     — customer orders (both roles, volunteer filtered)
POST   /weeks/:weekId/orders     — confirm order from intake (operator)
PATCH  /weeks/:weekId/orders/:orderId — edit order (operator, Open state only)
DELETE /weeks/:weekId/orders/:orderId — cancel order (operator, Open state only)
GET    /weeks/:weekId/intake     — intake queue (operator)
PATCH  /weeks/:weekId/intake/:messageId — approve/reject message (operator)
GET    /weeks/:weekId/delivery   — delivery items (volunteer + operator)
PATCH  /weeks/:weekId/delivery/:assignmentId — record delivered qty (volunteer + operator, state-gated)
GET    /weeks/:weekId/packing    — packing list (volunteer)
PATCH  /weeks/:weekId/orders/:orderId/packed — mark packed (volunteer)
PATCH  /weeks/:weekId/orders/:orderId/dispatched — mark dispatched (volunteer)
GET    /weeks/:weekId/walkin     — walk-in sales (operator)
POST   /weeks/:weekId/walkin     — record walk-in sale (operator)
POST   /weeks/:weekId/localfarmer-inbound — record local farmer inbound (operator)
GET    /weeks/:weekId/reconciliation — price differences (operator)
POST   /weeks/:weekId/reconciliation/:diffId/confirm — confirm difference (operator)
GET    /weeks/:weekId/farmerpayments — farmer payment records (operator)
PATCH  /weeks/:weekId/farmerpayments/:paymentId — mark payment status (operator)
GET    /weeks/:weekId/summary    — weekly financial summary (operator, Closed state)
GET    /customers                — customer list (operator)
POST   /customers                — register customer (operator)
PATCH  /customers/:customerId    — edit customer (operator)
GET    /customers/:customerId/wallet — wallet balance and ledger (operator)
POST   /customers/:customerId/wallet/topup — record top-up (operator, state-gated)
GET    /farmers                  — farmer list (operator)
POST   /farmers                  — register farmer (operator)
PATCH  /farmers/:farmerId        — edit farmer (operator)
GET    /catalogue                — product catalogue (both roles)
POST   /catalogue                — add product (operator)
PATCH  /catalogue/:productId     — edit product (operator)
POST   /webhook/whatsapp         — WhatsApp Cloud API webhook (no auth, HMAC-verified)
GET    /events/intake-queue      — SSE stream for real-time intake queue (operator)
GET    /catalogue/search         — similarity-search against catalogue (operator, supports duplicate-check UI)
```

**API conventions:**

- API responses that include product references resolve product_id to name_en and name_ta from the product_catalogue collection before serialisation. The frontend never displays a raw product_id to the operator.
- A read-only similarity-search endpoint (GET /api/v1/catalogue/search?q=<name>) supports the duplicate-check UI in the add-product form. It runs the shared Levenshtein similarity utility against all active catalogue items and returns matches scoring ≥ 0.6, capped at 5 results. The POST /api/v1/catalogue route is not modified — the check is UI-only and advisory.
- The farmer assignment upsert (PATCH /weeks/:weekId/delivery/:assignmentId, Mode A) accepts buffer_qty as a direct absolute quantity in the product's unit. buffer_pct is deprecated and nullable on the FarmerOrderAssignment model. outgoing_qty is always computed server-side as preorder_qty + buffer_qty and is not accepted from the client.

### 4.2 State Machine Enforcement Layer

The state machine is enforced as a Fastify plugin (`stateMachineGuard`) that intercepts every mutating request and checks whether the requested action is permitted in the current week state.

**Implementation:**

```javascript
// Pseudocode — stateMachineGuard plugin
const PERMITTED_ACTIONS = {
  'POST /weeks/:weekId/produce':     ['setup', 'open'],
  'PATCH /weeks/:weekId/produce/:id':['setup', 'open'],
  'POST /weeks/:weekId/orders':      ['open'],
  'PATCH /weeks/:weekId/orders/:id': ['open'],
  'PATCH /weeks/:weekId/state':      null, // handled by transition validator
  'POST /weeks/:weekId/walkin':      ['market_day'],
  // ... full table mirrors PRD Section 3.3
};

fastify.addHook('preHandler', async (request, reply) => {
  const routeKey = `${request.method} ${request.routerPath}`;
  const permittedStates = PERMITTED_ACTIONS[routeKey];
  if (!permittedStates) return; // no gate on this route

  const week = await db.weeks.findOne({ _id: request.params.weekId });
  if (!permittedStates.includes(week.state)) {
    reply.code(409).send({
      error: 'ACTION_NOT_PERMITTED_IN_STATE',
      currentState: week.state,
      permittedStates
    });
    throw new Error('state gate blocked');
  }
});
```

**State transition validator:**
`PATCH /weeks/:weekId/state` accepts a `targetState` body parameter. The server validates:
1. The transition is the legal next step (no skipping states, no reversal).
2. All gate conditions for the transition are met (e.g., no Pending Payment orders before lock; all reconciliation items confirmed before close).
3. If any condition fails, the transition is rejected with a structured error listing the blocking items by category.

Gate conditions are evaluated server-side by dedicated validator functions, one per transition. These are not UI-only checks.

### 4.3 Wallet Engine

All wallet operations are handled by a single `WalletEngine` module. No wallet mutation occurs outside this module — this is enforced by code structure (all routes that touch wallets call WalletEngine methods, never write to the Customer or WalletTransaction collections directly).

**Key methods:**

```javascript
WalletEngine.topUp(customerId, amountPaise, channel, referenceNote, weekId, operatorId)
WalletEngine.debitForOrder(customerId, orderValue, orderId, weekId)
WalletEngine.reverseOrderDebit(customerId, originalDebitTxnId, orderId)
WalletEngine.applyPriceDiff(customerId, amountPaise, direction, lineItemId, weekId)
WalletEngine.applyBalancePayment(customerId, amountPaise, channel, orderId, weekId)
WalletEngine.manualAdjustment(customerId, amountPaise, direction, reason, operatorId)
```

**Paise enforcement:** Every method accepts and returns integer paise. The module contains a startup assertion that throws if any monetary value passed is a non-integer or a float. Display conversion (`paise / 100`) happens only in the serialisation layer (API response formatters), never in computation.

**Wallet balance constraint:** `debitForOrder` and `applyPriceDiff` (debit direction) perform a MongoDB `findOneAndUpdate` with a `$gte: 0` constraint on `wallet_balance` after the decrement:

```javascript
// Atomic balance update — rejects if result would go below zero
const result = await db.customers.findOneAndUpdate(
  { _id: customerId, wallet_balance: { $gte: amountPaise } },
  { $inc: { wallet_balance: -amountPaise } },
  { returnDocument: 'after' }
);
if (!result) throw new WalletInsufficientError();
```

This enforces the zero-floor constraint at the database operation level, not just in application code.

**Overdelivery edge case (PRD Section 7.5):** When a price difference debit would exceed the wallet balance, `applyPriceDiff` uses a two-step atomic operation: debit wallet to zero (using the `$gte` pattern with the actual current balance), then create a `CustomerDue` record for the remainder. Both writes occur within a MongoDB session to ensure consistency.

**Running balance:** Every `WalletTransaction` document stores `running_balance` (the wallet balance after the transaction). This is computed as `previousBalance ± amount` at write time and written atomically with the balance update. This allows the ledger to be displayed in order without re-summing the full history.

### 4.4 Rule-Based Parser Module

The parser is a pure JavaScript module with no external dependencies. It is invoked synchronously by the webhook handler immediately after message receipt.

**Inputs:** Raw message text string, current week's produce list (array of `{product_id, name_en, name_ta, unit}`), synonym table (loaded from MongoDB `config/synonyms` document on server start and cached in memory).

**Outputs:** Array of parsed line items with confidence flags, as specified in PRD Section 6.3.

**Synonym table:** Loaded once at server startup from a MongoDB document. The server caches this in memory. If the document is updated (post-MVP operator-editable feature), a `SIGHUP` or admin endpoint triggers a cache reload without server restart.

**Parser steps (mirrors PRD Section 6.3):**

```javascript
function parseMessage(rawText, produceList, synonymTable) {
  const segments = rawText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  return segments.map(segment => parseSegment(segment, produceList, synonymTable));
}

function parseSegment(segment, produceList, synonymTable) {
  const qty = extractQuantity(segment);         // returns {value, rawToken} or null
  const unit = extractUnit(segment, synonymTable); // normalises via synonym table
  const productText = extractProductText(segment, qty?.rawToken, unit?.rawToken);
  const match = matchProduct(productText, produceList, synonymTable);

  return {
    rawText: segment,
    productId: match?.product_id ?? null,
    rawProductText: productText,
    quantity: qty?.value ?? null,
    unit: unit?.canonical ?? null,
    confidence: deriveConfidence(match, qty, unit)
  };
}
```

**"Same as last week" detection:** A pre-parse check tests the entire message against a list of trigger phrases (including Tamil equivalents). If matched, the parser returns immediately with a single item: `{ confidence: 'manual_required', reason: 'repeat_order' }`. The parser does not attempt to retrieve last week's order — that is a post-MVP feature.

**Voice note and image handling:** The webhook handler checks `media_type` before invoking the parser. If `media_type` is not `text`, the parser is not called. The InboundMessage is written with `parse_status: 'voice_note'` or `parse_status: 'image'`.

**Step 5b — Similarity fallback:** When the synonym table match (Step 5) returns no result, the parser runs a Levenshtein edit-distance pass against all name_en and name_ta values in the produce list. The best match is returned as suggestedProductId, suggestedProductName, and similarityScore fields on the ParseResult. These fields are computed at intake-queue read time (not stored in MongoDB) by the GET /weeks/:weekId/intake route handler, which re-runs the similarity pass against the current produce list before serialising the response. The similarity utility lives at server/lib/similarity.js and is shared with the catalogue duplicate-check feature.

### 4.5 FCFS Allocation Engine

The FCFS engine runs when a volunteer records a delivered quantity that creates a shortfall against total confirmed ordered quantity for that item.

**Trigger:** `PATCH /weeks/:weekId/delivery/:assignmentId` — when `delivered_qty < sum of ordered_qty across all Confirmed orders for the item`.

**Algorithm:**
1. Fetch all Confirmed `CustomerOrder` documents for the week containing the shortfall item, sorted by `fcfs_timestamp ASC`.
2. Walk the sorted list. Allocate `ordered_qty` to each customer until `delivered_qty` is exhausted.
3. The customer at the point of exhaustion receives the remainder. All subsequent customers receive zero for this item.
4. Round weight quantities (kg, 100g) to 2 decimal places. Round count quantities (piece, bunch) to whole numbers (floor, not round — do not allocate units that do not exist).
5. Write the allocated `delivered_qty` to each affected `OrderLineItem`.

The engine is re-run if the operator edits delivered quantities in Reconciliation state (Section 4.9.1 of PRD). The re-run overwrites the previous FCFS allocation for that item.

---

## 5. WhatsApp Integration Architecture

### 5.1 Cloud API Configuration

The integration uses the WhatsApp Business Cloud API (Meta-hosted). The operator's verified Business phone number is registered as the sender/receiver. Incoming messages arrive via HTTP POST to the webhook endpoint.

**[GAP — confirm API type]:** This architecture assumes the Cloud API. If the account was set up as On-Premise, the webhook receiver logic is identical but outbound message sending (post-MVP) uses a different endpoint. Confirm with the operator before Sprint 0.

### 5.2 Webhook Endpoint

**URL:** `POST https://<fly-app>.fly.dev/webhook/whatsapp`

**Verification handshake (GET):** WhatsApp sends a GET request with `hub.challenge` during setup. The endpoint responds with the challenge value. This is a one-time setup step.

**HMAC verification:** Every incoming POST is verified against the `X-Hub-Signature-256` header using the WhatsApp App Secret. Requests that fail HMAC verification are rejected with HTTP 403 before any processing occurs. This prevents replay attacks and spoofed webhook calls.

**Always-on guarantee:** The webhook is co-hosted in the same Fastify process as the API. Fly.io's free tier keeps the VM running permanently (no spin-down). There is no cold start for the webhook. This is the primary reason Fly.io was selected over Render.

### 5.3 Message Ingestion Flow

```
WhatsApp Cloud API
  │  POST /webhook/whatsapp
  ▼
Fastify webhook handler
  1. HMAC verify — reject if invalid (HTTP 403)
  2. Respond HTTP 200 immediately (before any processing)
     — WhatsApp requires a 200 within 20 seconds or it retries
  3. Enqueue processing to setImmediate() / async job
  4. Job: extract message_id, sender_phone, body, media_type,
          timestamp from API payload
  5. Deduplicate: check if message_id already exists in InboundMessage
     — if yes, discard silently (idempotent)
  6. Match sender_phone against Customer collection
  7. Find active week in 'open' state (if any)
  8. For text messages: run rule-based parser
  9. Write InboundMessage document to MongoDB (immutable)
 10. Push SSE event to operator intake queue stream
```

**Why respond HTTP 200 immediately:** If processing takes longer than 20 seconds (unlikely but possible on a slow Atlas query), WhatsApp will retry the webhook. Responding 200 immediately, then processing asynchronously, prevents duplicate message creation. Deduplication by `message_id` (step 5) handles the rare case where a retry arrives before processing completes.

### 5.4 FCFS Timestamp

The FCFS timestamp is extracted from the `timestamp` field in the WhatsApp API webhook payload. This is the Unix timestamp of when the message was delivered to the WhatsApp platform — not when the webhook was called, not when the server processed the message.

```javascript
const fcfsTimestamp = new Date(parseInt(payload.entry[0].changes[0].value.messages[0].timestamp) * 1000);
```

This value is written to `InboundMessage.fcfs_timestamp` and subsequently to `CustomerOrder.fcfs_timestamp` when the operator approves the order. It is never overwritten or recalculated.

### 5.5 Duplicate Message Handling

Three scenarios can produce duplicate webhook calls:

| Scenario | Handling |
|---|---|
| WhatsApp retries because our 200 response was slow | Resolved by step 5 (deduplication by `message_id`) |
| Meta delivers the same message twice (rare but documented) | Resolved by step 5 |
| Operator accidentally approves the same message twice | The InboundMessage `queue_status` is set to `approved` after first approval; the API rejects a second approval attempt with a 409 error |

### 5.6 Message Queue and Operator Review

The InboundMessage collection acts as the message queue. The operator intake queue screen queries:

```
GET /api/v1/weeks/:weekId/intake?status=pending
```

This returns all `InboundMessage` documents for the active week with `queue_status: 'pending'`, sorted by `fcfs_timestamp ASC` (earliest message first — FCFS order).

Each message in the queue shows: customer name (from matched `customer_id`), original message body, parsed order preview (from `parsed_items`), parse confidence flags, and any flags (voice note, no active week, unknown sender).

When the operator approves a message, the API:
1. Creates the `CustomerOrder` with `fcfs_timestamp` copied from the `InboundMessage`.
2. Sets `InboundMessage.queue_status` to `approved`.
3. Runs wallet check and sets order status to `confirmed` or `pending_payment`.

When the operator rejects a message (e.g., a message that is clearly not an order), the API sets `queue_status` to `rejected` with an optional operator note. Rejected messages remain in the database (immutable audit trail) but no longer appear in the pending queue.

---

## 6. Database Schema Mapping

### 6.1 MongoDB Collections

Each PRD entity maps to a MongoDB collection. The collection names and document structures follow the PRD Section 11 schema directly. Key architectural decisions are noted per collection.

**Collection: `farmers`**
- Index: `{ phone: 1 }` (unique) — enforces phone uniqueness at DB level
- Index: `{ farmer_type: 1, active: 1 }` — for filtered list queries

**Collection: `customers`**
- Index: `{ phone: 1 }` (unique) — enforces phone uniqueness; used for WhatsApp message matching
- `wallet_balance` field: Integer (paise). Never updated directly — always via WalletEngine using atomic `findOneAndUpdate`.

**Collection: `product_catalogue`**
- Index: `{ active: 1 }` — for produce list building queries
- The synonym table is **not** stored in this collection. It lives in a separate `config` collection document (see below).

**Collection: `market_weeks`**
- Index: `{ market_date: 1 }` (unique) — one week per market date
- Index: `{ state: 1 }` — for "find the active open week" queries (used by webhook handler on every message)
- `state` field is the single source of truth for week lifecycle. Never updated directly — always via state transition validator.

**Collection: `weekly_produce_items`**
- Index: `{ week_id: 1, product_id: 1 }` (unique) — one price per item per week
- Index: `{ week_id: 1, display_order: 1 }` — for ordered produce list display

**Collection: `customer_orders`**
- Index: `{ week_id: 1, customer_id: 1 }` — order lookup per customer per week
- Index: `{ week_id: 1, status: 1, fcfs_timestamp: 1 }` — FCFS-sorted order queries for packing list and shortfall allocation; this is the critical query path. Compound index on `(week_id, status, fcfs_timestamp)` covers both the filter and the sort in a single index scan.
- Index: `{ week_id: 1, status: 1 }` — for pre-lock Pending Payment check

**Collection: `order_line_items`**
- Stored as a **subcollection within `customer_orders`** (embedded array `line_items` on the order document), not as a separate collection.
- Rationale: Line items are always read and written together with their parent order. Embedding eliminates join-equivalent queries. At ~50 customers × ~5 items per order, the embedded array will never approach MongoDB's 16MB document size limit.

**Collection: `wallet_transactions`**
- Index: `{ customer_id: 1, created_at: -1 }` — for ledger display (most recent first)
- Index: `{ week_id: 1, type: 1 }` — for weekly summary aggregation queries
- Index: `{ customer_id: 1, week_id: 1 }` — for per-customer per-week summary

**Collection: `inbound_messages`**
- Index: `{ message_id: 1 }` (unique) — deduplication on webhook receipt
- Index: `{ week_id: 1, queue_status: 1, fcfs_timestamp: 1 }` — intake queue display, FCFS-ordered

**Collection: `farmer_order_assignments`**
- Index: `{ week_id: 1, farmer_id: 1, product_id: 1 }` (unique) — one assignment per farmer per item per week

**Collection: `local_farmer_inbound`**
- Index: `{ week_id: 1, farmer_id: 1 }` — inbound records per farmer per week

**Collection: `walkin_sales`**
- Index: `{ week_id: 1, inventory_source: 1 }` — weekly summary aggregation

**Collection: `farmer_payments`**
- Index: `{ week_id: 1, farmer_id: 1 }` (unique) — one payment record per farmer per week
- Index: `{ farmer_id: 1, status: 1 }` — outstanding liability queries (all weeks)

**Collection: `weekly_summaries`**
- Index: `{ week_id: 1 }` (unique)
- Documents are write-once at week close. Never updated.

**Collection: `config`**
- Single document `{ _id: 'synonyms', table: [...] }` for the parser synonym table.
- Loaded at server startup and cached in memory.

### 6.2 Indexing Strategy Notes

The two most performance-sensitive query paths are:

1. **FCFS packing list sort:** `db.customer_orders.find({ week_id, status: 'confirmed' }).sort({ fcfs_timestamp: 1 })` — covered by the compound index on `(week_id, status, fcfs_timestamp)`.

2. **Weekly summary aggregation:** The summary is computed once at week close by aggregating `wallet_transactions`, `walkin_sales`, and `farmer_payments` for the week. Given ~50 customers and ~15 farmers, this is a small dataset — the aggregation will complete well under the 5-second NFR even without special indexing, but the `week_id` indexes on all collections ensure the aggregation scans only the relevant week's documents.

### 6.3 Paise Storage Confirmation

Every monetary field in every collection is stored as an integer (BSON `Int32` or `Int64`). MongoDB Atlas's BSON `Double` type is never used for monetary fields. The Fastify request/response schemas use `type: 'integer'` for all monetary fields, which causes Fastify's built-in schema validator to reject any non-integer monetary value at the API boundary.

---

## 7. Authentication and Authorisation

### 7.1 Role Model

Two roles exist in MVP:

| Role | Access | How Role is Assigned |
|---|---|---|
| `operator` | Full read/write to all API routes except webhook | Set as a Firebase Auth custom claim by the system administrator at account creation |
| `volunteer` | Read-only packing and delivery routes; write to delivered qty, packed status, dispatched status | Set as a Firebase Auth custom claim by the system administrator |

No self-registration. The system administrator (the operator, at go-live) creates user accounts via the Firebase Auth Admin SDK from a one-time setup script. A simple `create-user.js` script is provided in the repository:

```
node scripts/create-user.js --email=volunteer1@example.com --role=volunteer
```

### 7.2 Token Strategy

Firebase Authentication issues ID tokens (JWTs) on successful login. Tokens expire after 1 hour. The Firebase client SDK handles token refresh automatically — the PWA never manages token refresh manually.

**Flow:**

1. User submits email + password to Firebase Auth (client SDK call — does not hit our API).
2. Firebase returns an ID token.
3. PWA stores the token in memory (not `localStorage` — avoids XSS exposure). The Firebase client SDK manages token persistence using its own secure storage.
4. Every API request includes `Authorization: Bearer <id-token>`.
5. Fastify's `fastify-firebase-auth` plugin (or equivalent) verifies the token against Firebase's public keys on every request. Verification is done locally using the cached public key — no round-trip to Firebase per request.
6. The decoded token's `role` custom claim is extracted and made available to route handlers as `request.user.role`.

### 7.3 API-Layer Authorisation

Authorisation is enforced in a Fastify `preHandler` hook that runs after token verification:

```javascript
fastify.addHook('preHandler', async (request, reply) => {
  const route = request.routerPath;
  const method = request.method;
  const role = request.user?.role;

  // Volunteer write routes (explicit allowlist)
  const VOLUNTEER_WRITE_ROUTES = [
    'PATCH /api/v1/weeks/:weekId/delivery/:assignmentId',
    'PATCH /api/v1/weeks/:weekId/orders/:orderId/packed',
    'PATCH /api/v1/weeks/:weekId/orders/:orderId/dispatched',
  ];

  // Volunteer read routes (explicit allowlist)
  const VOLUNTEER_READ_ROUTES = [
    'GET /api/v1/weeks/:weekId',
    'GET /api/v1/weeks/:weekId/delivery',
    'GET /api/v1/weeks/:weekId/packing',
    'GET /api/v1/weeks/:weekId/dispatch',
    'GET /api/v1/catalogue',
  ];

  const routeKey = `${method} ${route}`;

  if (role === 'operator') return; // operators pass all auth checks

  if (role === 'volunteer') {
    if (VOLUNTEER_WRITE_ROUTES.includes(routeKey)) return;
    if (VOLUNTEER_READ_ROUTES.includes(routeKey) && method === 'GET') return;
    reply.code(403).send({ error: 'FORBIDDEN' });
    throw new Error('authorisation blocked');
  }

  reply.code(401).send({ error: 'UNAUTHORISED' });
  throw new Error('authentication blocked');
});
```

The volunteer sees a `403 FORBIDDEN` (not a `401`) when attempting to access operator-only routes. This is the correct HTTP semantic — the user is authenticated but not authorised.

### 7.4 Webhook Endpoint

The `/webhook/whatsapp` route is excluded from JWT verification. It uses HMAC signature verification instead (see Section 5.2). The route is not accessible to PWA users — it is a server-to-server endpoint only.

---

## 8. Deployment Architecture

### 8.1 Component Deployment Map

| Component | Where | Provider | Free-Tier Limits |
|---|---|---|---|
| React PWA (static build) | Served from Fly.io VM as static files via Fastify `@fastify/static` | Fly.io | Included in VM allocation |
| Fastify REST API | Fly.io VM (1 shared-CPU, 256MB RAM) | Fly.io | 3 free VMs, 160GB outbound/month |
| WhatsApp webhook receiver | Same Fastify process on Fly.io VM | Fly.io | Same VM — no additional cost |
| SSE stream | Same Fastify process on Fly.io VM | Fly.io | Long-lived HTTP connections; no known limit on free tier |
| MongoDB Atlas | M0 free cluster (shared) | MongoDB Atlas | 512MB storage, 100 connections max |
| Firebase Authentication | Firebase free Spark plan | Google Firebase | 10,000 auth/month; 1M phone verifications (not used) |

### 8.2 Fly.io VM Configuration

The application runs on a single Fly.io VM for MVP. A second VM can be added (still within the free 3-VM allowance) for redundancy post-MVP.

**`fly.toml` configuration:**

```toml
app = "farmer-marketplace"
primary_region = "sin"    # Singapore — closest region to Gudalur/Ooty

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [services.concurrency]
    hard_limit = 100
    soft_limit = 80
    type = "requests"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
```

**Region:** Singapore (`sin`) — lowest latency to Gudalur/Ooty from available Fly.io free-tier regions.

### 8.3 Cold Start and Spin-Down Mitigations

**Spin-down:** Fly.io free-tier VMs do not spin down. The VM runs permanently unless the application crashes or is explicitly stopped. No mitigation required for spin-down.

**Crash recovery:** Fly.io automatically restarts a crashed process. The restart typically completes in under 30 seconds. During this window, WhatsApp webhook messages will receive no response and will be retried by Meta (retry interval: approximately 5 minutes). The deduplication logic (Section 5.3, step 5) ensures retried messages are not processed twice.

**Memory pressure:** 256MB RAM is sufficient for the Fastify process at MVP scale. Node.js heap usage for this application (no in-memory image handling, no large data structures, synonym table ~5KB) will peak under 100MB. If memory pressure becomes an issue post-MVP, upgrading to 512MB on Fly.io costs approximately $1.94/month — the first affordable paid upgrade.

### 8.4 MongoDB Atlas Connection

The Fly.io VM connects to MongoDB Atlas over TLS. The connection string includes credentials stored as Fly.io secrets (environment variables, not committed to source).

**Connection pool:** Mongoose (ODM) default connection pool of 5 connections is sufficient for MVP. Atlas M0 limits to 100 simultaneous connections. At 1 VM with a pool of 5, there is no risk of hitting this limit.

**Atlas M0 limitations to note:**
- Shared cluster — no dedicated RAM. Query performance is best-effort.
- No change streams (Atlas M0 does not support change streams). This is why SSE is driven from the API layer (on InboundMessage write) rather than a MongoDB change stream listener.
- No Atlas backups on M0 (shared cluster). Data loss risk on MongoDB infrastructure failure. Mitigation: weekly export of critical collections to a JSON file stored in the repository or a separate free-tier object store. This is a post-MVP operational procedure, not a system feature.

### 8.5 Environment Variables and Secrets

All secrets are stored as Fly.io secrets (injected as environment variables at runtime):

```
MONGODB_URI          — Atlas connection string
FIREBASE_PROJECT_ID  — Firebase project ID for token verification
WHATSAPP_APP_SECRET  — For HMAC webhook verification
WHATSAPP_VERIFY_TOKEN— For webhook setup handshake
```

Firebase service account credentials for the Admin SDK are stored as a single `FIREBASE_SERVICE_ACCOUNT_JSON` secret (base64-encoded JSON).

### 8.6 CI/CD

For a 1–2 person team, a minimal CI/CD approach is appropriate:

- **GitHub Actions:** On push to `main`, run `npm test` and `fly deploy`.
- `fly deploy` builds the Docker image on Fly.io's remote builder (no local Docker required) and deploys with zero-downtime rolling restart.
- The `Dockerfile` is a two-stage build: Node.js build stage (Vite build + npm install), then a minimal Node.js production image.

---

## 9. Data Integrity and Audit Trail

### 9.1 Immutability

No document in any collection is ever updated via a field overwrite after it is created, except for:

1. `market_weeks.state` — updated only by the state transition validator (append-only state progression).
2. `customers.wallet_balance` — updated atomically by WalletEngine (see Section 4.3).
3. `customer_orders.status` — updated only by state-gated transitions (pending_payment → confirmed → packed → dispatched → delivered).
4. `order_line_items.delivered_qty` and `difference_confirmed` — updated only in Delivery and Reconciliation states respectively.
5. `farmer_order_assignments.delivered_qty` — updated only in Delivery state.
6. `local_farmer_inbound.sold_qty` — updated only in Reconciliation state.
7. `inbound_messages.queue_status` — updated from `pending` to `approved` or `rejected`.

All other records (`wallet_transactions`, `inbound_messages` body/parsed content, `walkin_sales`, `farmer_payments`, `weekly_summaries`) are write-once and never modified after creation.

**Corrections via reversal:** If the operator needs to correct a wallet top-up, they do not edit the original `WalletTransaction`. Instead, they create a `manual_adjustment` transaction with a mandatory reason note. The original transaction remains in the ledger. This is enforced by the WalletEngine — there is no `updateTransaction` method.

### 9.2 Audit Fields

Every document that records an operator action includes:

- `created_at`: Server timestamp at write time.
- `created_by`: `operator_id` (Firebase UID of the acting operator, from the JWT). This allows attribution of every action to a specific operator account even in a multi-operator scenario.

State transitions on `market_weeks` include a `state_history` array (append-only) recording each transition:
```json
{
  "state_history": [
    { "from": "setup", "to": "open", "at": "2026-04-18T06:00:00Z", "by": "operator_uid_abc" },
    { "from": "open", "to": "locked", "at": "2026-04-20T14:30:00Z", "by": "operator_uid_abc" }
  ]
}
```

### 9.3 Paise Integer Enforcement — End-to-End

| Layer | Enforcement |
|---|---|
| API input | Fastify JSON Schema: `type: 'integer'` on all monetary fields — non-integers are rejected at the boundary with a 400 error |
| Business logic | WalletEngine accepts only integers; startup assertion rejects floats |
| Database write | Mongoose schema: `type: Number, validate: Number.isInteger` on all monetary fields |
| Database storage | BSON Int32/Int64 — MongoDB does not coerce integers to doubles for integer inputs |
| API output | Monetary values serialised as integers in paise; a `displayAmount` utility formats for the UI as INR string (`(paise / 100).toFixed(2)`) |
| UI display | `paise.js` utility: `formatINR(paise)` returns a formatted string; never used in arithmetic |

The only place division occurs is in `formatINR()`. Division result is used for display only, never stored or passed back to the API.

### 9.4 State Machine Gate Implementation

State gates are enforced at two levels:

1. **Route-level gate (Section 4.2):** Rejects requests for actions not permitted in the current week state before business logic runs.
2. **Transition-level gate:** Validates gate conditions before a state transition is permitted. Gate condition validators are pure functions that query the database and return either `{ ok: true }` or `{ ok: false, blockers: [...] }`.

Example — Order Lock gate:

```javascript
async function validateLockTransition(weekId) {
  const pendingPaymentCount = await db.customer_orders.countDocuments({
    week_id: weekId,
    status: 'pending_payment'
  });
  if (pendingPaymentCount > 0) {
    const orders = await db.customer_orders.find(
      { week_id: weekId, status: 'pending_payment' },
      { projection: { customer_id: 1, order_value: 1 } }
    ).toArray();
    return { ok: false, blockers: orders.map(o => ({ type: 'PENDING_PAYMENT', orderId: o._id, ...})) };
  }
  return { ok: true };
}
```

The frontend displays the blockers list to the operator when a transition is rejected. The operator cannot override — the gate is hard.

---

## 10. Non-Functional Requirement Mapping

| NFR (PRD Section 12) | How the Architecture Satisfies It |
|---|---|
| **Language — Tamil and English static labels** | All UI strings are stored in a `translations` object in the frontend (`/shared/lib/translations.js`). Language is toggled at the app level via a React context; selected language stored in `localStorage`. No runtime translation API is called. All string keys are defined at build time. |
| **Device — Operator: laptop/tablet, 768px+ viewport** | Operator PWA is built with a responsive grid that assumes minimum 768px. No mobile breakpoints for operator screens. Tested on Chrome, Firefox, Safari current and prior major version. |
| **Device — Volunteer: Android 8+, low-end phone** | Volunteer chunk is lazy-loaded and isolated. No polyfills required for Android 8+ (Chrome 67+). Touch targets minimum 44px enforced in CSS. No pinch-zoom required — all interactive elements sized appropriately. |
| **Connectivity — Volunteer: <8 seconds on 3G ~1.5 Mbps** | Volunteer chunk ~40KB + shared ~30KB + React ~45KB = ~115KB total first load. At 1.5 Mbps = ~12 Mbps download, this transfers in under 0.1 seconds. Render time on a low-end Android CPU is the dominant factor; the target of <8 seconds is achievable. Service worker eliminates network time entirely after first visit. |
| **Connectivity — Operator: stable broadband, no offline** | No service worker for operator routes. Standard HTTP caching headers applied by Fastify's static file serving. |
| **Performance — page transitions <2 seconds** | React lazy loading + Vite code splitting means subsequent page transitions within the operator PWA are client-side route changes with a small API fetch. On standard broadband, API responses from the Fly.io Singapore VM to Gudalur should complete in 100–300ms. Total transition time well under 2 seconds. |
| **Performance — weekly summary <5 seconds** | Weekly summary aggregates ~50 customer transactions, ~15 farmer payments, and walk-in sales for one week. This is a small dataset. MongoDB aggregation pipeline on indexed fields will complete in under 500ms on M0. |
| **Cost — free-tier only** | Every component maps to a free-tier provider (Fly.io, MongoDB Atlas M0, Firebase Spark). No paid SaaS subscriptions. See Section 8.1. |
| **Authentication — operator and volunteer before access** | Firebase Auth email/password. Both roles require authentication before any API route is reachable. Role claims verified on every request. See Section 7. |
| **Data retention — indefinite** | MongoDB Atlas M0 512MB will retain all data for 52 weeks at MVP scale: ~50 orders/week × 52 weeks = 2,600 orders; ~50 wallet transactions/week × 52 weeks = 2,600 transactions. Estimated total storage: well under 50MB after one year of operation. 512MB limit is not a constraint at MVP scale. |
| **Audit trail — timestamped, attributed, immutable** | See Section 9.1 and 9.2. All writes include `created_at` and `created_by`. Corrections are new entries. No update/delete methods exist for financial records. |
| **Payment — manual confirmation only** | No payment gateway SDK. No UPI webhook. Wallet credits require explicit operator action via `POST /customers/:id/wallet/topup`. The API has no endpoint that accepts a payment notification from an external source. |
| **Monetary arithmetic — integer paise** | See Section 9.3. Enforced at API boundary, business logic layer, database schema, and serialisation layer. |

---

## 11. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Fly.io changes free-tier terms** — VM spin-down introduced or VM count reduced | Medium | High — webhook loses always-on guarantee | Monitor Fly.io announcements. Fallback: Railway (paid tier ~$5/month is affordable post-MVP) or a $5/month DigitalOcean droplet. Architecture change required only for hosting — code is portable. |
| R2 | **MongoDB Atlas M0 shared cluster performance degradation** — shared cluster has unpredictable query latency under concurrent load from other tenants | Low at MVP scale | Medium — summary generation and packing list queries slow | Atlas M0 is adequate for ~50 customers and weekly batch cadence. If latency becomes unacceptable, upgrade to M2 (~$9/month). All indexes are in place for the upgrade to be seamless. |
| R3 | **MongoDB Atlas M0 change stream unavailability** — M0 does not support change streams | Confirmed (by design) | Low — handled by SSE from API layer | SSE from the API on InboundMessage write is the designed approach. No change streams are used. Not a risk — a known constraint. |
| R4 | **Firebase Auth free-tier limit** — 10,000 auth events/month | Very Low | Low | At 1–3 operators + ~5 volunteers, maximum auth events per month is ~2,000 (assumes ~20 logins/day). Limit is not a practical constraint. |
| R5 | **WhatsApp Cloud API message delivery failure** — network interruption between Meta's servers and the webhook | Low | Medium — message lost if Meta stops retrying | Meta retries for approximately 7 days. Deduplication handles replay. The operator should monitor the intake queue for gaps and contact the customer if an expected order does not appear. No system mitigation available beyond deduplication. |
| R6 | **Parser accuracy too low** — Tamil/English mixed messages produce frequent unmatched segments | High early on | Medium — operator correction burden higher than expected | Parser is designed for high operator correction rate initially. The synonym table is operator-extensible post-MVP. The burden is review-and-correct, not re-entry, which is less effort than the current fully manual process. Accuracy improves as the synonym table grows. |
| R7 | **Volunteer offline sync conflict** — operator and volunteer edit same delivered quantity while volunteer is offline | Low | Low | Last-write-wins with operator priority. See Section 3.4. Operator always has final authority. |
| R8 | **Wallet negative balance edge case** — race condition between two concurrent top-up/debit operations | Very Low | High — financial integrity | MongoDB atomic `findOneAndUpdate` with `$gte` constraint prevents negative balance in all concurrent scenarios. Tested case: two simultaneous order confirmations for the same customer — only one will succeed; the other receives a `WalletInsufficientError`. |
| R9 | **Fly.io Singapore region latency** — Gudalur/Ooty is not served by a nearby cloud region; Singapore is the closest Fly.io free-tier region | Medium | Low — adds 80–120ms to API calls | 80–120ms latency is imperceptible for operator actions and acceptable for volunteer interactions. Not a functional risk. |
| R10 | **WhatsApp Business API account suspension** — Meta suspends the account for policy violation | Low | Critical — entire order intake flow breaks | Fallback is Decision 1 Option A (operator manual entry). The system is designed to support manual order entry without the WhatsApp API — operators can enter orders directly in the PWA. The B-Assisted flow adds convenience but is not the only path. |

---

## 12. Out of Scope for MVP Architecture

The following are not designed, not built, and not planned in the MVP architecture. Their exclusion is intentional.

| Item | Why Excluded |
|---|---|
| WebSocket-based real-time updates | SSE is sufficient for the operator intake queue use case. WebSockets add connection complexity for no additional benefit at MVP. |
| MongoDB change streams | Not available on Atlas M0 free tier. SSE from the API layer achieves the same result for the intake queue. |
| Multiple Fly.io VMs / load balancing | Single VM is sufficient at MVP scale. Adding a second VM introduces session affinity complexity for SSE connections. |
| Horizontal scaling | Weekly batch cadence with ~50 customers. Horizontal scaling is not a concern until at least 10× current scale. |
| CDN for static assets | PWA assets are served from the Fly.io VM. A CDN (Cloudflare free tier) could be added trivially post-MVP but is not needed at current scale given Singapore region latency is already acceptable. |
| Email or SMS notification system | All operator and customer communication is via WhatsApp. No email or SMS infrastructure is required. |
| Automated database backups | Atlas M0 does not provide backups. Manual weekly export procedure is an operational task, not a system feature. |
| Runtime AI (translation, speech-to-text, LLM) | Hard constraint from PRD Section 1.2. Not in scope under any circumstance in MVP. |
| Payment gateway / UPI integration | Hard constraint from PRD Section 1.2. Manual confirmation only. |
| Farmer-facing or customer-facing interfaces | No system access for farmers or customers in MVP. |
| Multi-tenancy | Single marketplace operator. No tenant isolation required. |

---

## 13. Open Items

The following items cannot be finalised without additional information or action. Each is flagged with the responsible party and the blocking dependency.

| # | Item | Blocking Dependency | Owner |
|---|---|---|---|
| O1 | **[GAP — confirm API type]** WhatsApp Business API — Cloud API or On-Premise? | Operator must confirm how the account was set up. This architecture assumes Cloud API. If On-Premise, the outbound message sending endpoint differs (post-MVP impact only; inbound webhook is identical). | Operator to confirm before Sprint 0 |
| O2 | **Firebase project creation** — Firebase project must be created, the Spark plan selected, and service account credentials generated before authentication can be tested. | Firebase console setup. | Developer, Sprint 0 |
| O3 | **Fly.io account and app creation** — `fly launch` must be run, the app named, and the Singapore region selected. Secrets (`MONGODB_URI`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) must be set via `fly secrets set`. | Fly.io account required. | Developer, Sprint 0 |
| O4 | **MongoDB Atlas M0 cluster creation** — Free cluster must be provisioned in the AWS Singapore (`ap-southeast-1`) region to minimise latency to the Fly.io Singapore VM. IP allowlist must include Fly.io's outbound IP range (or be set to `0.0.0.0/0` for MVP simplicity with connection string authentication). | Atlas account required. | Developer, Sprint 0 |
| O5 | **WhatsApp webhook verification** — Once the Fly.io deployment is live, the webhook endpoint URL must be registered in the Meta Business Platform and the verification handshake completed. The `WHATSAPP_VERIFY_TOKEN` must match the value set in the Meta dashboard. | Fly.io deployment must be live first. | Developer, Sprint 0 after deployment |
| O6 | **Synonym table initial seed** — The parser synonym table needs a review pass with the operator to confirm Tamil-language order phrase variants that are common in the actual customer base. The pre-seeded table in PRD Section 6.4 covers standard English tokens. Tamil token mappings should be gathered from the operator's existing WhatsApp order history before go-live. | Operator WhatsApp history review. | Operator + Developer, pre-launch |
| O7 | **First-week opening balance entry** — PRD Section 10.5 requires the operator to manually enter the opening cash and bank balance at go-live. This must be done before the first week is closed. A one-time admin screen or script is required for this entry. | Post-deployment setup step. | Developer to provide; Operator to execute at go-live |

---

*Document prepared for internal use. Do not distribute.*
*Grounded in: context_v4.md (v4.0) · decisions.md (v1.0) · process_map.md (v1.0) · interactions_flows.md (v1.1) · PRD.md (v1.0)*
*All hard constraints respected. All open architectural decisions resolved or flagged. No requirements introduced beyond confirmed source documents.*
