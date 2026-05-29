# CLAUDE.md — B2C Farmer Marketplace
## Persistent Project Rules for Cursor

**Version:** 1.0  
**Project:** Community-Driven Organic Farmer Marketplace — Gudalur–Ooty Region  
**Status:** Active — read this file before every session  
**Source documents:** PRD.md v1.0 · ARCHITECTURE.md v1.0 · decisions.md v1.0 · context_v4.md · interactions_flows.md v1.1 · process_map.md

---

## 1. What This Project Is

A single Progressive Web Application that digitises the weekly operations of a community organic market. The system serves **one operator** (1–3 people) and **a handful of volunteers**. Customers and farmers are **not system users** — they interact only via WhatsApp and in person.

The operator is the centre of gravity. Every screen, every automation, every error message exists to reduce operator effort. This is not a consumer product.

**Weekly scale:** ~50 registered customers, ~15 outstation farmers, ~5–10 local farmers, one market day per week.

---

## 2. Technology Stack — Do Not Deviate

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + Vite | React 18, Vite 5 |
| Backend | Node.js + Fastify | Node 20, Fastify 4 |
| Database | MongoDB + Mongoose | Atlas M0 (free tier) |
| Auth | Firebase Authentication | Spark plan (free) |
| Hosting | Fly.io | Single VM, Singapore region (`sin`) |
| Real-time | Server-Sent Events (SSE) | Native browser `EventSource` |
| WhatsApp | Meta Cloud API | Inbound webhook only in MVP |

**No deviations without explicit instruction.** Do not suggest Next.js, Express, Supabase, WebSockets, GraphQL, Redis, or any other alternative. These decisions are final (see decisions.md and ARCHITECTURE.md Section 2.2).

---

## 3. The Three Absolute Constraints

These are the most important rules in this file. Violations here cause financial bugs that are hard to detect and painful to correct.

### 3.1 Paise-Only Arithmetic

**All monetary values are stored, processed, and passed between functions as integer paise (1 INR = 100 paise).**

```javascript
// CORRECT
const orderValue = 25000; // ₹250.00 in paise
const total = qty * pricePerUnit; // both integers, result is integer

// WRONG — never do this
const orderValue = 250.00; // INR float
const total = (qty * pricePerUnit) / 100; // division in business logic
```

The only place division by 100 occurs is in `src/shared/lib/paise.js → formatINR()`, which is a display-only utility. Its output is never stored, never passed to the API, never used in arithmetic.

**Fastify schema enforcement:** All monetary fields in request/response schemas use `type: 'integer'`. Non-integers are rejected at the API boundary with a 400 error before reaching business logic.

**Mongoose enforcement:** All monetary fields use `type: Number, validate: v => Number.isInteger(v)` in the schema definition.

**WalletEngine startup assertion:** On server start, WalletEngine runs a self-check that throws if any input to its methods is a non-integer. This is a canary, not a substitute for the above.

### 3.2 No Wallet Writes Outside WalletEngine

The `WalletEngine` module (located at `src/server/modules/walletEngine.js`) is the **only** code that may write to `customers.wallet_balance` or insert into `wallet_transactions`. No route handler, no other module, no test helper writes to these locations directly.

WalletEngine exposes exactly six methods. Use only these:

```javascript
WalletEngine.topUp(customerId, amountPaise, channel, referenceNote, weekId, operatorId)
WalletEngine.debitForOrder(customerId, orderValue, orderId, weekId)
WalletEngine.reverseOrderDebit(customerId, originalDebitTxnId, orderId)
WalletEngine.applyPriceDiff(customerId, amountPaise, direction, lineItemId, weekId)
WalletEngine.applyBalancePayment(customerId, amountPaise, channel, orderId, weekId)
WalletEngine.manualAdjustment(customerId, amountPaise, direction, reason, operatorId)
```

If you find yourself writing `db.customers.updateOne({ wallet_balance: ... })` outside WalletEngine, stop. That is a bug.

### 3.3 No State Writes Outside the State Machine Guard

The `market_weeks.state` field is the single source of truth for what actions are permitted. It may only be updated by the `stateMachineGuard` Fastify plugin via `PATCH /weeks/:weekId/state`.

- No route handler sets `state` directly.
- No test sets `state` via `updateOne` without going through the transition validator.
- State transitions are one-way and sequential. There is no rollback in MVP.

The seven states in order: `setup → open → locked → delivery → market_day → reconciliation → closed`

---

## 4. Folder Structure

Follow this structure exactly. Do not create new top-level directories without instruction.

```
/
├── src/
│   ├── operator/              ← lazy-loaded; operator role only
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── WeekSetup.jsx
│   │   │   ├── ProduceList.jsx
│   │   │   ├── OrderIntake.jsx
│   │   │   ├── OrderManagement.jsx
│   │   │   ├── WalletManagement.jsx
│   │   │   ├── DeliveryManagement.jsx
│   │   │   ├── MarketDay.jsx
│   │   │   ├── Reconciliation.jsx
│   │   │   ├── WeeklySummary.jsx
│   │   │   └── Registrations.jsx
│   │   └── components/
│   ├── volunteer/             ← lazy-loaded; volunteer role only
│   │   ├── pages/
│   │   │   ├── DeliveryEntry.jsx
│   │   │   ├── PackingList.jsx
│   │   │   └── Dispatch.jsx
│   │   └── components/
│   ├── shared/                ← downloaded by both roles
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── NavBar.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── LoadingSpinner.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   ├── useWeekState.js
│   │   │   └── useSSE.js
│   │   └── lib/
│   │       ├── api.js         ← fetch wrapper with JWT injection
│   │       ├── constants.js
│   │       ├── paise.js       ← formatINR() only; no arithmetic
│   │       └── translations.js ← all UI strings, EN + TA
│   ├── service-worker/        ← volunteer-only offline form state
│   ├── App.jsx
│   └── main.jsx
├── server/
│   ├── plugins/
│   │   ├── stateMachineGuard.js
│   │   └── authVerify.js
│   ├── modules/
│   │   ├── walletEngine.js    ← THE ONLY wallet writer
│   │   ├── fcfsEngine.js
│   │   └── parser.js
│   ├── routes/
│   │   ├── weeks.js
│   │   ├── orders.js
│   │   ├── customers.js
│   │   ├── farmers.js
│   │   ├── catalogue.js
│   │   ├── delivery.js
│   │   ├── reconciliation.js
│   │   ├── summary.js
│   │   └── webhook.js
│   ├── models/                ← Mongoose schemas
│   │   ├── Farmer.js
│   │   ├── Customer.js
│   │   ├── ProductCatalogue.js
│   │   ├── MarketWeek.js
│   │   ├── WeeklyProduceItem.js
│   │   ├── CustomerOrder.js
│   │   ├── WalletTransaction.js
│   │   ├── InboundMessage.js
│   │   ├── FarmerOrderAssignment.js
│   │   ├── LocalFarmerInbound.js
│   │   ├── WalkInSale.js
│   │   ├── FarmerPayment.js
│   │   └── WeeklySummary.js
│   └── app.js                 ← Fastify instance, plugin registration
├── scripts/
│   ├── create-user.js
│   └── seed.js
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── Dockerfile
├── fly.toml
└── package.json
```

---

## 5. Naming Conventions

### Files and Directories
- React components: `PascalCase.jsx`
- Hooks: `useCamelCase.js`
- Server modules, routes, models: `camelCase.js`
- Test files: `moduleName.test.js`, co-located in `tests/unit/` or `tests/integration/`

### Database Fields
- Snake\_case for all MongoDB field names (matches PRD Section 11 exactly)
- All monetary fields suffixed with no unit annotation in the name, but documented as paise in schema comments
- Boolean soft-delete fields always named `active`
- All documents include `created_at` (server timestamp) and `created_by` (Firebase UID) on operator actions

### API Routes
- Base path: `/api/v1/`
- Resource-based, lowercase, hyphen-separated for multi-word: `/weeks/:weekId/produce-items`
- Week-scoped resources always nested under `/weeks/:weekId/`

### JavaScript
- `const` by default; `let` only when reassignment is necessary; never `var`
- Named exports for all modules and components (not default exports, except React page components which use default export)
- Async/await throughout; no raw Promise chains

---

## 6. State Machine — Permitted Actions Reference

This is the authoritative gate table. The `stateMachineGuard` plugin enforces this. When implementing any route that writes data, confirm the permitted states here before coding.

| Action | setup | open | locked | delivery | market_day | recon | closed |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Add produce list items | Y | Y | N | N | N | N | N |
| Edit produce item price | Y | Y | N | N | N | N | N |
| Delete produce list items | Y | N | N | N | N | N | N |
| Publish week (→ open) | Y | N | N | N | N | N | N |
| Confirm customer orders | N | Y | N | N | N | N | N |
| Record wallet top-up | Y | Y | Y | Y | Y | Y | N |
| Edit confirmed order | N | Y | N | N | N | N | N |
| Cancel order | N | Y | N | N | N | N | N |
| Lock orders (→ locked) | N | Y | N | N | N | N | N |
| Set buffer / farmer assignments | N | N | Y | N | N | N | N |
| Confirm produce arrived (→ delivery) | N | N | Y | N | N | N | N |
| Record delivered quantities (volunteer) | N | N | N | Y | N | N | N |
| Edit delivered quantities (operator) | N | N | N | Y | N | Y | N |
| Mark orders Packed | N | N | N | Y | N | N | N |
| Open market day (→ market_day) | N | N | N | Y | N | N | N |
| Mark orders Dispatched | N | N | N | N | Y | N | N |
| Record local farmer inbound | N | N | N | N | Y | N | N |
| Record walk-in sales | N | N | N | N | Y | N | N |
| Record balance payment | N | N | N | N | Y | N | N |
| Open reconciliation (→ reconciliation) | N | N | N | N | Y | N | N |
| Confirm price differences | N | N | N | N | N | Y | N |
| Mark outstation farmer payments | N | N | N | N | N | Y | N |
| Record local farmer payments | N | N | N | N | N | Y | N |
| Close week (→ closed) | N | N | N | N | N | Y | N |
| View weekly financial summary | N | N | N | N | N | N | Y |
| Register farmer or customer | Y | Y | Y | Y | Y | Y | Y |
| View customer wallet / ledger | Y | Y | Y | Y | Y | Y | Y |

**State transition gate conditions (must pass before transition is permitted):**

- `setup → open`: produce list has at least 1 item
- `open → locked`: zero orders in `pending_payment` status
- `locked → delivery`: no gate condition
- `delivery → market_day`: no gate condition
- `market_day → reconciliation`: no gate condition
- `reconciliation → closed`: all price differences confirmed, all outstation farmer payment statuses set, all local farmer payments recorded

When a gate rejects, return `{ ok: false, blockers: [...] }` — not a generic 409. The frontend displays the blockers list so the operator can navigate directly to each blocking item.

---

## 7. Wallet Engine Rules — Reference

Never implement wallet behaviour outside `walletEngine.js`. The rules below are hard constraints that the engine enforces:

1. **Zero-floor constraint.** Wallet balance cannot go below zero. `debitForOrder` and `applyPriceDiff` (debit direction) use atomic `findOneAndUpdate` with `{ wallet_balance: { $gte: amountPaise } }`. If the constraint fails, throw `WalletInsufficientError`. Never use a read-then-write pattern for balance checks.

2. **Overdelivery two-step.** When `applyPriceDiff` (debit) would exceed the wallet balance: first debit wallet to zero (atomic, using the actual current balance as the `$gte` value), then create a `CustomerDue` record in `wallet_transactions` for the remainder. Both writes happen within a MongoDB session.

3. **Running balance on every write.** Every `WalletTransaction` document stores `running_balance` = balance after this transaction. Computed at write time as `previousBalance ± amount`. Written atomically with the balance update. Never recomputed from history.

4. **Transaction type enum.** Valid `WalletTransaction.type` values: `top_up`, `order_debit`, `order_debit_reversal`, `price_diff_credit`, `price_diff_debit`, `customer_due`, `balance_payment`, `manual_adjustment`. No other values.

5. **Corrections by reversal.** The engine has no `updateTransaction` or `deleteTransaction` method. Corrections create a new transaction (typically `manual_adjustment` with a mandatory `reference_note`). The original transaction is immutable.

6. **No write outside a session for multi-step operations.** Any wallet operation involving more than one MongoDB write (e.g., overdelivery two-step, order debit + WalletTransaction insert) must use a MongoDB session.

---

## 8. FCFS Timestamp Rules

FCFS timestamp is recorded once, at message receipt, and never overwritten.

- Source: `payload.entry[0].changes[0].value.messages[0].timestamp` from the WhatsApp Cloud API payload (Unix seconds → multiply by 1000 for JS Date).
- Written to `InboundMessage.fcfs_timestamp` on webhook receipt.
- Copied to `CustomerOrder.fcfs_timestamp` when the operator approves the order.
- **Never set to `new Date()` (server time).** Always sourced from the WhatsApp payload timestamp.
- Used as the sort key for shortfall allocation in the FCFS engine: lower timestamp = higher priority.

---

## 9. Immutability Rules

The following fields are write-once after document creation. Do not implement update routes for these:

- All `wallet_transactions` fields after insert
- `InboundMessage.body`, `.parsed_items`, `.fcfs_timestamp`, `.sender_phone` after insert
- `CustomerOrder.fcfs_timestamp`, `.order_value` at confirmation, `.wallet_debited`
- `weekly_summaries` — entire document is write-once at week close
- `walkin_sales` — entire document is write-once at creation

The following fields are mutable within their state window only (see Section 6):

- `market_weeks.state` — via state machine guard only
- `customers.wallet_balance` — via WalletEngine only
- `customer_orders.status` — via state-gated transitions only
- `order_line_items.delivered_qty` — Delivery state and Reconciliation state only
- `order_line_items.difference_confirmed` — Reconciliation state only
- `farmer_order_assignments.delivered_qty` — Delivery state only
- `inbound_messages.queue_status` — pending → approved or rejected only

---

## 10. Authentication and Authorisation Rules

- **All routes** except `GET /webhook/whatsapp` (verification handshake) and `POST /webhook/whatsapp` require `Authorization: Bearer <firebase-id-token>`.
- The webhook routes use HMAC verification (`X-Hub-Signature-256` header against `WHATSAPP_APP_SECRET`) instead of JWT.
- Role is a Firebase Auth custom claim (`operator` or `volunteer`). Extracted from the decoded JWT as `request.user.role`.
- Operator passes all auth checks.
- Volunteer is allowed only the explicit allowlists in `authVerify.js` plugin (see ARCHITECTURE.md Section 7.3 for the exact lists).
- Never trust the frontend for role enforcement. The API enforces role independently on every request, even if the UI has already hidden the action.

---

## 11. Webhook Pipeline Rules

The webhook handler must follow this exact sequence. Do not reorder steps.

1. HMAC verify — `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`. Reject with HTTP 403 if invalid.
2. Respond HTTP 200 **immediately** — before any processing. WhatsApp requires a 200 within 20 seconds or it retries.
3. Enqueue processing asynchronously (`setImmediate` or equivalent).
4. Extract: `message_id`, `sender_phone`, `body`, `media_type`, `timestamp`.
5. Deduplicate: check `InboundMessage` for existing `message_id`. If found, discard silently. This is idempotent.
6. Match `sender_phone` against `customers.phone`. Set `customer_id` if matched; null if not.
7. Find active week (`market_weeks.state: 'open'`). Set `week_id` if found; null if not.
8. For `media_type: 'text'` only: invoke the rule-based parser.
9. Write `InboundMessage` document (immutable from this point).
10. Push SSE event to the operator intake queue stream.

**The system must never silently drop a received message.** Every webhook call that passes HMAC verification must result in an `InboundMessage` document, regardless of whether the sender is known, a week is active, or the message is parseable.

---

## 12. Rule-Based Parser Rules

The parser is a pure JavaScript module at `server/modules/parser.js` with no external dependencies.

- Input: raw message string, current week's produce list, synonym table (in-memory cache from `config/synonyms` MongoDB document).
- Output: array of parsed line items, each with `{ rawText, productId, rawProductText, quantity, unit, confidence }`.
- Confidence values: `'clean'` (product matched, qty and unit extracted), `'partial'` (some tokens matched), `'manual_required'` (zero parseable items or known trigger phrase).
- The parser **never** retrieves last week's order for "same as last week" messages. It returns `{ confidence: 'manual_required', reason: 'repeat_order' }` and stops. Last-week retrieval is post-MVP.
- For `media_type` not equal to `'text'`: parser is not called. `InboundMessage.parse_status` is set to `'voice_note'` or `'image'` respectively.
- The synonym table is loaded once at server startup and cached in memory. A cache reload is triggered by a `SIGHUP` or an admin endpoint — not by server restart.

---

## 13. SSE (Server-Sent Events) Rules

- SSE endpoint: `GET /api/v1/events/intake-queue` — operator role only.
- When a new `InboundMessage` is written (step 9 of the webhook pipeline), the server pushes a `new-message` SSE event to all connected operator clients.
- The `useSSE.js` hook in the frontend uses the browser `EventSource` API, which handles reconnection automatically.
- **No WebSockets.** SSE is unidirectional and sufficient for this use case.
- If SSE fails, the frontend falls back to polling at 5-second intervals. This is a fallback, not the default.

---

## 14. Frontend Conventions

### UI Strings
- All user-visible strings (labels, buttons, error messages, toasts, WhatsApp templates) are defined in `src/shared/lib/translations.js` as a key-value object with `en` and `ta` keys.
- **No hardcoded English strings in components.** Use `t('key')` or equivalent translation lookup.
- Language toggle is stored in `localStorage` and read at app init. It is a global setting — not per-screen.

### Monetary Display
- Use `formatINR(paise)` from `src/shared/lib/paise.js` for all displayed monetary values.
- This function returns a formatted string (e.g., `"₹250.00"`). Never use it in arithmetic.
- Never display raw paise integers to the operator.

### State Machine Visibility
- Every operator screen shows the current week state as a persistent `StateMachineBadge` component in the header.
- Action buttons not available in the current state are `disabled` with a tooltip, not hidden. Exception: buttons that are irrelevant to the screen's purpose may be hidden entirely.

### Volunteer Screens
- Touch targets minimum **44px** on all interactive elements. Enforce with CSS `min-height: 44px; min-width: 44px`.
- No chart libraries, no images, no heavy assets on volunteer routes.
- Offline banner: displayed when `navigator.onLine === false`. Text defined in `translations.js`.
- Service worker scoped to `/volunteer/*` only.

### Bundle Discipline
- Operator chunk: lazy-loaded via `React.lazy()`. Never imported into shared or volunteer chunks.
- Volunteer chunk: lazy-loaded via `React.lazy()`. Never imported into shared or operator chunks.
- No chart libraries (recharts, chart.js, etc.) in volunteer chunk.

---

## 15. MongoDB Schema Conventions

Every Mongoose model follows these rules:

```javascript
// Monetary field
price_per_unit: {
  type: Number,
  required: true,
  validate: { validator: Number.isInteger, message: 'Must be integer paise' }
}

// Enum field
state: {
  type: String,
  enum: ['setup', 'open', 'locked', 'delivery', 'market_day', 'reconciliation', 'closed'],
  required: true
}

// Soft delete
active: { type: Boolean, default: true }

// Audit fields on all operator-action documents
created_at: { type: Date, default: Date.now }
created_by: { type: String, required: true } // Firebase UID
```

**Indexes — create these explicitly, do not rely on Mongoose's default `_id` index alone:**

- `customers`: `{ phone: 1 }` unique
- `farmers`: `{ phone: 1 }` unique; `{ farmer_type: 1, active: 1 }`
- `market_weeks`: `{ market_date: 1 }` unique; `{ state: 1 }`
- `customer_orders`: `{ week_id: 1, status: 1, fcfs_timestamp: 1 }`; `{ week_id: 1, customer_id: 1 }`; `{ week_id: 1, status: 1 }`
- `inbound_messages`: `{ message_id: 1 }` unique; `{ week_id: 1, queue_status: 1, fcfs_timestamp: 1 }`
- `wallet_transactions`: `{ customer_id: 1, created_at: -1 }`; `{ week_id: 1, type: 1 }`;  `{ customer_id: 1, week_id: 1 }`
- `weekly_produce_items`: `{ week_id: 1, product_id: 1 }` unique; `{ week_id: 1, display_order: 1 }`
- `farmer_order_assignments`: `{ week_id: 1, farmer_id: 1, product_id: 1 }` unique
- `farmer_payments`: `{ week_id: 1, farmer_id: 1 }` unique; `{ farmer_id: 1, status: 1 }`

**Embedding vs. referencing:** `OrderLineItem` documents are embedded as a `line_items` array on `CustomerOrder`, not stored as a separate collection. All other entities are separate collections.

---

## 16. Environment Variables

All secrets injected via Fly.io secrets at runtime. Never committed to source.

```
MONGODB_URI                    — Atlas M0 connection string (TLS)
FIREBASE_PROJECT_ID            — Firebase project ID
FIREBASE_SERVICE_ACCOUNT_JSON  — Base64-encoded service account JSON (Admin SDK)
WHATSAPP_APP_SECRET            — HMAC verification of incoming webhooks
WHATSAPP_VERIFY_TOKEN          — Webhook setup handshake token
PORT                           — 8080 (set in fly.toml)
NODE_ENV                       — production / development
```

The `.env.example` file lists all variables with placeholder values. Real values are never in source control.

---

## 17. Test Requirements

Tests are written **alongside implementation**, not after. Every module listed below requires tests before the module is considered complete.

### Mandatory test coverage

**WalletEngine — `tests/unit/walletEngine.test.js`**
- `topUp`: happy path, minimum valid amount
- `debitForOrder`: sufficient balance, insufficient balance (must throw `WalletInsufficientError`), exact balance (zero after debit)
- `reverseOrderDebit`: reversal creates correct inverse transaction
- `applyPriceDiff`: credit direction, debit direction sufficient balance, debit direction insufficient balance (overdelivery two-step — wallet goes to zero, `CustomerDue` created for remainder)
- `applyBalancePayment`: happy path
- `manualAdjustment`: credit and debit directions
- Race condition: concurrent debit calls on same customer — only one succeeds, other throws

**FCFS Engine — `tests/unit/fcfsEngine.test.js`**
- Sufficient stock: all orders fully allocated
- Exact stock: last customer gets exactly the remaining quantity
- Shortfall: correct cutoff point, customers beyond cutoff receive zero
- Weight rounding: result rounded to 2 decimal places for kg/100g units
- Count rounding: floor (not round) for piece/bunch units — do not allocate partial units
- Re-run after operator quantity correction: previous allocation overwritten

**Parser — `tests/unit/parser.test.js`**
- Clean English text: product matched, quantity and unit extracted
- Tamil token: recognised via synonym table
- Abbreviation: synonym table maps correctly
- Voice note: parser not called, `parse_status: 'voice_note'`
- Zero-parse message: returns `confidence: 'manual_required'`
- "Same as last week" phrase: returns `confidence: 'manual_required', reason: 'repeat_order'`
- Multi-line order: each line parsed as a separate segment

**State Machine Guard — `tests/unit/stateMachineGuard.test.js`**
- Every permitted action in its permitted states: passes through
- Every action in a non-permitted state: returns 409 with `ACTION_NOT_PERMITTED_IN_STATE`
- Transition gate — `open → locked` with pending payment orders: returns blockers list
- Transition gate — `reconciliation → closed` with unconfirmed price diffs: returns blockers list
- Transition gate — all gate conditions met: transition succeeds

**Integration — `tests/integration/weekLifecycle.test.js`**
- Full week from `POST /weeks` through `PATCH /weeks/:id/state` (closed): assert week state at each step
- Wallet race condition: two concurrent `debitForOrder` calls for same customer with insufficient balance for both — one succeeds, one throws
- Webhook replay deduplication: same `message_id` posted twice — second is silently discarded, only one `InboundMessage` document exists

---

## 18. Hard Constraints — Never Violate

These are non-negotiable. No exception, no workaround, no "just for now."

1. **No runtime AI.** No calls to OpenAI, Claude, Anthropic, Google Translate, Whisper, or any AI API. No speech-to-text. No dynamic translation. Static pre-translated strings only. This is a hard constraint from PRD Section 1.2.

2. **No payment gateway.** No Razorpay, Stripe, PayU, or UPI automation. No endpoint that accepts a payment notification from an external source. All wallet credits require explicit operator action via the `topUp` method. Manual confirmation only.

3. **No customer or farmer system access.** No authentication, no login screen, no API route for customers or farmers. They interact via WhatsApp only. No exceptions in MVP.

4. **No multi-tenancy.** Single operator. No tenant isolation, no subdomain routing, no org-level data separation.

5. **No automated emails or SMS.** All communication is via WhatsApp, initiated by the operator manually copying and pasting system-generated text. The system sends no messages autonomously.

6. **Free-tier only.** MongoDB Atlas M0, Firebase Spark, Fly.io free tier. No paid service integrations in MVP.

7. **No WebSockets.** SSE is the chosen real-time mechanism. See ARCHITECTURE.md Section 2.2 for rationale.

8. **No outbound WhatsApp API calls.** The system receives messages via webhook. It does not send messages in MVP. Operator copies system-generated text and sends manually.

---

## 19. Reference Documents

When implementing any feature, consult these documents in order:

1. **This file (CLAUDE.md)** — constraints, conventions, rules
2. **PRD.md Section 3** — state machine and gate conditions (authoritative)
3. **PRD.md Section 7** — wallet and payment model (authoritative)
4. **PRD.md Section 11** — data model and field definitions (authoritative)
5. **ARCHITECTURE.md Section 4** — backend module implementations (wallet, state machine, FCFS, parser)
6. **ARCHITECTURE.md Section 5** — WhatsApp webhook pipeline
7. **ARCHITECTURE.md Section 6** — MongoDB schema decisions and indexes
8. **interactions_flows.md** — step-by-step operator interaction flows for each screen
9. **process_map.md** — end-to-end weekly process context

If a detail appears in this file and a reference document, this file governs. If a detail is not in this file, the reference document governs. If documents conflict, raise it — do not guess.

---

*This file is auto-loaded by Cursor on every session. Keep it accurate. Update it when decisions change — do not let it drift from the codebase.*
