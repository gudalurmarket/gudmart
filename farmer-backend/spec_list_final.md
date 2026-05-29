# Spec List — B2C Farmer Marketplace
**Version:** 2.0  
**Last Updated:** April 2026  
**Project:** Community Organic Farmer Marketplace, Gudalur–Ooty

27 specs total — 19 Cursor inputs, 8 outside Cursor actions.

---

## How to Read This Document

**Input for Cursor** means the spec is written as a document Cursor reads before generating code. It must exist and be complete before Cursor is asked to implement the corresponding module or screen.

**Outside Cursor** means the spec describes a manual action — infrastructure setup, operator session, account creation, or operational procedure. Cursor is not involved.

**Produced by Developer + Operator** means the developer drafts and the operator reviews or provides content (Tamil strings, customer data, message templates). These require scheduling a joint session.

---

## Category A — Foundation

These must exist before any code is written. A1 is already complete.

---

### A1 — CLAUDE.md
**Status:** ✅ Complete  
**Input for:** Cursor  
**Produced by:** Developer

Written and active in the Cursor project folder. Contains stack constraints, paise arithmetic rules, WalletEngine exclusivity, state machine exclusivity, folder structure, naming conventions, full state-action gate table, immutability rules, auth and role rules, webhook pipeline sequence, test case requirements, and hard constraints. No further action required on this spec.

---

### A2 — Style Reference
**Input for:** Cursor  
**Produced by:** Developer  
**Format:** New section appended to CLAUDE.md — not a standalone file  
**Depends on:** A1

Define the minimum visual contract Cursor needs to build consistent UI without inventing it:

- Colour palette: primary, secondary, surface, error, warning, success — as CSS custom property names and hex values
- Typography: font stack, size scale (base, sm, lg, xl), line height
- Spacing scale: 4px base unit, named steps (xs, sm, md, lg, xl)
- Touch target rule: 44px minimum on all interactive elements on volunteer screens, enforced in CSS
- Component class conventions: standard Tailwind utility patterns for buttons, badges, cards, inputs, modals
- Tamil font: font family name and loading strategy (system font or web font)

Appended to CLAUDE.md so Cursor reads it automatically on every session.

---

### A3 — Translations and Bilingual Content
**Input for:** Cursor  
**Produced by:** Developer (drafts) + Operator (Tamil copy review)  
**Format:** Standalone `src/shared/lib/translations.js` file  
**Depends on:** A1

Define every user-visible string as a key-value object with `en` and `ta` keys:

```javascript
export const translations = {
  'week.state.setup':   { en: 'Setup',           ta: '...' },
  'week.state.open':    { en: 'Open for Orders',  ta: '...' },
  // all 7 state names
  // all action button labels
  // all error messages mapped from error codes
  // all toast messages
  // all confirmation dialog copy
  // all WhatsApp-copyable templates: produce list, order summary, farmer order
};
```

No hardcoded English strings anywhere in the codebase. Every component uses a translation key. Operator involvement is required to review Tamil strings before the file is finalised.

---

### A4 — Error Constants
**Input for:** Cursor  
**Produced by:** Developer  
**Format:** Addition to CLAUDE.md — not a standalone spec  
**Depends on:** A1

Add the following to CLAUDE.md so Cursor generates `server/lib/errors.js` correctly:

```javascript
// AppError base class pattern
class AppError extends Error {
  constructor(code, httpStatus, message) { ... }
}

// Named error classes and their HTTP status codes:
// WalletInsufficientError      422  — wallet balance too low for debit
// ActionNotPermittedInState    409  — state gate blocked this route
// TransitionGateBlocked        409  — transition gate blocked with blockers array
// DuplicateMessageError        409  — message_id already exists in InboundMessages
// UnknownSenderError           200  — sender phone not matched; message stored, not rejected
// WeekNotFoundError            404
// OrderNotFoundError           404
// CustomerNotFoundError        404
// DuplicatePhoneError          409  — phone number already registered
```

---

### A5 — Environment Variables
**Input for:** Cursor + Outside (Fly.io secrets setup)  
**Produced by:** Developer  
**Format:** Committed `.env.example` file in repository root  
**Depends on:** A1

All variables are already documented in CLAUDE.md Section 16. The deliverable is a `.env.example` file with placeholder values that Cursor references when scaffolding and developers use when setting up local environments:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<db>
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_JSON=<base64-encoded-json>
WHATSAPP_APP_SECRET=your-app-secret
WHATSAPP_VERIFY_TOKEN=your-verify-token
PORT=8080
NODE_ENV=development
```

Real values are set via `fly secrets set` and are never committed to source control.

---

## Category B — Backend

Write in this order: B1 first, then B2 + B3 + B4 as a cluster (they are interdependent), then B5, then B7 last (it depends on all of B2–B5 being locked).

---

### B1 — Database Schema
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** A1  
**Sequence:** First backend spec

Translate PRD Section 11 and Architecture Section 6 into a complete Mongoose schema spec. Covers all 13 collections with all fields, types, validation rules, embedding decisions, indexes, paise enforcement annotations, and audit field conventions.

Confirmed decisions to encode:

- `line_items` is embedded as an array on `CustomerOrder` — not a separate collection
- `config/synonyms` is a single document `{ _id: 'synonyms', table: [...] }` in a `config` collection
- All monetary fields: `type: Number, validate: { validator: Number.isInteger }`
- All indexes from CLAUDE.md Section 15 must be created explicitly in each model file
- All operator-action documents include `created_at: Date` and `created_by: String` (Firebase UID)

The 13 collections: `farmers`, `customers`, `product_catalogue`, `market_weeks`, `weekly_produce_items`, `customer_orders` (with embedded `line_items`), `wallet_transactions`, `inbound_messages`, `farmer_order_assignments`, `local_farmer_inbound`, `walkin_sales`, `farmer_payments`, `weekly_summaries`, plus `config`.

---

### B2 — State Machine
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B1  
**Sequence:** Write together with B3 and B4

Define the `stateMachineGuard` Fastify plugin completely:

- The 7 state constants and 6 legal transitions as named constants
- The full `PERMITTED_ACTIONS` map: route key (method + path pattern) → array of permitted state strings — every write route must be present
- Gate condition validator functions, one per transition: signature, the MongoDB query used, return shape `{ ok: true }` or `{ ok: false, blockers: [...] }`
- The blocker object structure for each transition type — used by the frontend to render navigable blocker rows
- The 409 response shape when a route-level state gate blocks: `{ error: 'ACTION_NOT_PERMITTED_IN_STATE', currentState, permittedStates }`
- The `state_history` append pattern on `market_weeks` — every transition appends `{ from, to, at, by }` to the array; the array is never overwritten

Gate conditions per transition:
- `setup → open`: produce list has at least 1 item
- `open → locked`: zero orders in `pending_payment` status
- `locked → delivery`: no gate condition
- `delivery → market_day`: no gate condition
- `market_day → reconciliation`: no gate condition
- `reconciliation → closed`: all price differences confirmed, all outstation farmer payment statuses set, all local farmer payments recorded

Cross-references: `applyBalancePayment` (B3) is only permitted in `market_day` state. FCFS engine (B4) is triggered in `delivery` state and re-run in `reconciliation` state.

---

### B3 — Wallet Engine
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B1  
**Sequence:** Write together with B2 and B4

Define all 6 wallet methods with complete input/output contracts. For each method: parameter list with types (all monetary parameters explicitly typed as integer paise), preconditions, the MongoDB operation used (atomic `findOneAndUpdate` vs session-wrapped multi-write), postconditions, error thrown on failure, and the exact `WalletTransaction` document written.

The 6 methods:

```
topUp(customerId, amountPaise, channel, referenceNote, weekId, operatorId)
debitForOrder(customerId, orderValuePaise, orderId, weekId)
reverseOrderDebit(customerId, originalDebitTxnId, orderId)
applyPriceDiff(customerId, amountPaise, direction, lineItemId, weekId)
applyBalancePayment(customerId, amountPaise, channel, orderId, weekId)
manualAdjustment(customerId, amountPaise, direction, reason, operatorId)
```

Critical edge cases that must be specified with the exact MongoDB operation:

- **`debitForOrder` zero-floor**: atomic `findOneAndUpdate` with `{ wallet_balance: { $gte: amountPaise } }` — if the constraint fails, throw `WalletInsufficientError`; never use read-then-write
- **`applyPriceDiff` debit overdelivery two-step**: when the debit amount exceeds current balance, debit to zero first (using actual current balance as the `$gte` value), then create a `CustomerDue` transaction for the remainder — both writes in a MongoDB session
- **Running balance**: every `WalletTransaction` stores `running_balance` = balance after this transaction, computed as `previousBalance ± amount` and written atomically with the balance update
- **Startup assertion**: on server start, WalletEngine runs a check that throws if any monetary argument is non-integer
- **Race condition outcome**: two concurrent `debitForOrder` calls with insufficient combined balance — one succeeds, one throws `WalletInsufficientError`; the atomic `$gte` pattern guarantees this without application-level locking

---

### B4 — FCFS Allocation Engine
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B1, B2  
**Sequence:** Write together with B2 and B3

Define the allocation engine as a standalone module:

- **Trigger condition**: `delivered_qty < sum(ordered_qty across all Confirmed CustomerOrders for this product in this week)` — checked on `PATCH /weeks/:weekId/delivery/:assignmentId`
- **No-op condition**: when `delivered_qty >= sum(ordered_qty)`, the engine does not run; all orders are fully satisfied
- **Algorithm** (5 steps):
  1. Fetch all Confirmed `CustomerOrder` documents for the week that contain the shortfall product
  2. Sort by `fcfs_timestamp ASC` (lowest timestamp = highest priority)
  3. Walk the sorted list; allocate `ordered_qty` to each customer until `delivered_qty` is exhausted
  4. The customer at the exhaustion point receives the remainder; all subsequent customers receive zero for this item
  5. Write `delivered_qty` to each affected `OrderLineItem` embedded in the `CustomerOrder`
- **Rounding rules**: weight units (kg, 100g) → round to 2 decimal places; count units (piece, bunch) → `Math.floor`, never `Math.round` — do not allocate fractional units
- **Re-run**: when the operator edits `delivered_qty` in Reconciliation state, the engine re-runs for that item and overwrites all previous `OrderLineItem.delivered_qty` values for affected orders

---

### B5 — Rule-Based Parser
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B1  
**Sequence:** After B2 + B3 + B4

Define the parser as a pure JavaScript module with no external dependencies (`server/modules/parser.js`):

- **Inputs**: raw message string, current week's produce list (`[{ product_id, name_en, name_ta, unit }]`), synonym table (in-memory cache)
- **Output per segment**: `{ rawText, productId, rawProductText, quantity, unit, confidence }`
- **5-step algorithm**: segment split on `[\n,;]+` → quantity extraction → unit extraction and normalisation → product text isolation → product match against produce list via synonym table
- **Confidence levels**: `clean` (product matched + quantity + unit extracted), `partial` (product matched but quantity or unit missing), `manual_required` (product unmatched or zero items)
- **"Same as last week" pre-parse check**: test entire message against trigger phrases (English + Tamil list) before running the algorithm — if matched, return immediately with `{ confidence: 'manual_required', reason: 'repeat_order' }`; do not attempt history retrieval (post-MVP)
- **Voice and image handling**: parser is not called if `media_type !== 'text'`; the calling webhook handler sets `parse_status: 'voice_note'` or `parse_status: 'image'` directly
- **Synonym table**: loaded once at server startup from the `config/synonyms` MongoDB document and cached in memory; cache reload triggered by `SIGHUP` or admin endpoint without server restart
- **Spec must include**: the initial synonym table entries covering standard English tokens, unit abbreviations (kg, gm, g, pcs, piece, bunch), and known product name variants — Tamil token entries are added after the F4 operator session

---

### B7 — API Route Contracts
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B2, B3, B4, B5  
**Sequence:** Last backend spec — write only after B2–B5 are locked

Define every route with: HTTP method + path, auth requirement (JWT role or HMAC-only for webhook), state gate (permitted states from B2), request schema (body fields with types — monetary fields as `integer`), response schema (fields with types), and named error responses.

**Weekly Summary Aggregation** is specified as a sub-section within B7 (not a separate document):

- Collections joined: `wallet_transactions`, `walkin_sales`, `farmer_payments`, `market_weeks`
- Aggregation stages: `$match` by `week_id`, `$group` by `channel` and transaction `type`, sum fields per the closing balance formula from PRD Section 10.3
- Output: a write-once `weekly_summaries` document
- Timing: runs once as part of the `reconciliation → closed` state transition handler

Include full request/response example pairs for the 5 most complex routes:
1. Order intake approve (`PATCH /weeks/:weekId/intake/:messageId`)
2. Wallet top-up (`POST /customers/:customerId/wallet/topup`)
3. FCFS delivery entry (`PATCH /weeks/:weekId/delivery/:assignmentId`)
4. State transition (`PATCH /weeks/:weekId/state`)
5. Weekly summary generation (triggered by the close transition)

---

## Category C — WhatsApp Integration

C1, C2, and C3 are Cursor inputs written during Week 2. C4 and C5 are outside Cursor actions — C4 has a potentially long Meta approval lead time and must be started as soon as F1 (infrastructure) is live.

---

### C1 — WhatsApp Payload Schema
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** A1

Document the exact JSON structure of every inbound WhatsApp Cloud API message type: text, audio, image, document, sticker, reaction, location. For each type: the full payload shape with field-level annotations indicating which fields are read by the webhook handler.

Must explicitly cover how to extract the five fields the system uses from every message type:

- `message_id` — for deduplication
- `sender_phone` — for customer matching
- `body` — for text messages only; null for others
- `media_type` — to route to parser or flag as voice/image
- `timestamp` — the FCFS timestamp source (Unix seconds from the WhatsApp platform, not server receipt time)

Also covers the verification handshake GET request payload structure used during initial webhook registration.

---

### C2 — WhatsApp Webhook Pipeline
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** A1, B1, B5

Expand the 10-step pipeline from CLAUDE.md Section 11 into a fully implementable spec for `server/routes/webhook.js`. For each step: the exact code pattern, the MongoDB query used where applicable, the error handling if the step fails, and the expected outcome.

Covers: HMAC verification pattern, immediate 200 response pattern, async enqueue with `setImmediate`, deduplication query, phone match query, active week query, parser invocation contract, `InboundMessage` write, and SSE push call. This spec is what Cursor uses to implement the webhook route in one pass without interpretation.

---

### C3 — SSE Stream
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** A1

Define the SSE endpoint and client hook completely:

- **Server side** (`GET /api/v1/events/intake-queue`): required response headers, connection map management, heartbeat interval, disconnection cleanup, and how the endpoint emits events when a new `InboundMessage` is written
- **Event types**: `connection-established` (on connect), `new-message` (on InboundMessage write), `heartbeat` (every 30 seconds to keep the connection alive)
- **Event payload structure** for `new-message`: fields included, format
- **Client side** (`src/shared/hooks/useSSE.js`): `EventSource` initialisation, event handler wiring, reconnection behaviour (native to `EventSource`), and the polling fallback: if `EventSource` is not supported or connection fails after 3 retries, fall back to polling `GET /api/v1/weeks/:weekId/intake?status=pending` at 5-second intervals

---

### C4 — Meta Business Platform Setup
**Outside Cursor — operator + developer action**  
**Owner:** Developer + Operator  
**When:** Start immediately — Meta account approval can take 1–2 weeks  
**Depends on:** F1 (Fly.io deployment must be live to register the webhook URL)

Step-by-step checklist:

1. Verify or create a Meta Business account
2. Register the operator's WhatsApp phone number as a Business phone number
3. Create a Meta App in the Meta Developer Console and add the WhatsApp product
4. Set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` values (these must match Fly.io secrets)
5. Register the webhook URL (`https://<fly-app>.fly.dev/webhook/whatsapp`) and complete the verification handshake
6. Send a test message from a personal phone and confirm it appears in the operator intake queue

This checklist cannot be executed until F1 (Fly.io deployment) is live.

---

### C5 — WhatsApp Message Templates
**Outside Cursor — content definition**  
**Owner:** Developer + Operator  
**When:** Near go-live — must be confirmed before it is hardcoded in `translations.js`

Joint session to define the exact formatted text for every operator-copyable message:

- Weekly produce list (Tamil + English): header, one line per item, footer
- Per-farmer consolidated order summary (Tamil + English): items, quantities, total
- Customer order confirmation text (if used)

Format must be reviewed and approved by the operator before the strings are added to `translations.js`. This is a content decision, not a developer decision.

---

## Category D — UI/UX

All Cursor inputs. Write D3 first within this category (it is referenced by D1). Write D1 with the Order Intake Queue screen first within D1.

---

### D1 — Operator Screen Specs (9 screens)
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B7 (route contracts must be locked before screen specs are written)

For each of the 9 screens: layout zones, primary data displayed, table columns and sort order, form fields with validation rules, action buttons with their screen positions and state-gate visibility conditions (visible / disabled / hidden per state), empty states, error states, and loading states.

**Spec the Order Intake Queue screen first** — it is the most complex screen and is referenced by D3 and D4. It must explicitly cover:

- The parse-review-confirm interaction: how the operator edits a partial parse, adds or removes line items, and approves or rejects the message
- Unknown sender flow: message displayed with warning, order entry blocked until customer is registered
- Voice note and image flows: flagged entries displayed with manual entry prompt
- SSE-driven live update: new messages appear without page refresh; queue count badge increments

The 9 screens in spec order:
1. Order Intake Queue ← spec first
2. Dashboard / Week Overview
3. Week Setup & Produce List
4. Order Management & Pending Payment List
5. Wallet Management & Ledger
6. Delivery Management
7. Market Day (Walk-in Sales + Local Farmer Inbound)
8. Reconciliation & Farmer Payments
9. Weekly Financial Summary

---

### D2 — Volunteer Screen Specs (3 screens)
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B7

For each of the 3 screens: mobile-first layout, explicit 44px touch target callouts on every interactive element, offline state display (what is shown when `navigator.onLine === false`), FCFS ordering display, and single-tap action design.

Each spec must explicitly state what is **not** rendered: no financial data, no wallet balances, no customer contact details beyond the customer's name at the dispatch screen.

The 3 screens:
1. Delivery Entry
2. Packing List
3. Dispatch

---

### D3 — State Transition UX
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B2, A3

Define the operator experience for all 6 state transitions. The core purpose of this spec is the **blocker resolution flow** — this is what Cursor will get wrong without explicit direction.

For each transition:

- Which button triggers it and where it lives on screen
- Confirmation dialog copy (as `translations.js` key references, not hardcoded strings)
- How the blockers list is displayed when the transition gate returns `{ ok: false, blockers: [...] }` — each blocker rendered as a tappable row showing the blocking item type, identifier, and a short description
- Navigation: tapping a blocker row navigates to the specific record that needs resolving
- The resolution loop: after resolving a blocker, the operator returns to the current screen and re-attempts the transition; the system re-evaluates all gate conditions

The 6 transitions: Setup → Open, Open → Locked, Locked → Delivery, Delivery → Market Day, Market Day → Reconciliation, Reconciliation → Closed.

---

### D4 — Async Feedback and Notifications
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** C3, D1

Define every asynchronous system event and the exact UI response pattern for each. Establishes the consistent pattern used across all screens — without this, each screen implements notifications differently.

Events to define:

- **SSE connection status**: persistent indicator showing connected / reconnecting / polling fallback — visible on all operator screens
- **New message in intake queue**: `new-message` SSE event → queue count badge increments, new row appears in queue list without page refresh
- **FCFS reallocation triggered**: toast notification listing the customers whose allocated quantities changed
- **Price edit → order reverted to Pending Payment**: inline flag on each affected order row + toast summarising how many orders were affected
- **Top-up recorded → pending payment prompt**: toast with navigation link to the Pending Payment list

General pattern decisions (apply consistently):
- Toasts: transient feedback for non-blocking system events (3 seconds, dismissible)
- Modals: confirmation required before destructive or irreversible actions
- Inline flags: persistent state shown on the affected record row until resolved

---

## Category E — Testing

E1 and E2 are Cursor inputs written in Week 4, alongside the start of backend coding.

---

### E1 — Unit Test Spec
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B2, B3, B4, B5  
**Note:** Test cases are listed in CLAUDE.md Section 17. This spec expands them into full test file outlines.

For each module: the `describe`/`it` block structure, test data fixtures (what seed data each test needs), and setup/teardown patterns. Cursor uses this to write tests alongside implementation.

Modules covered:

**`walletEngine.test.js`** — all 6 methods, each with happy path and edge cases from CLAUDE.md Section 17. Key edge cases: zero-floor constraint (debit fails when balance insufficient), overdelivery two-step (wallet debited to zero, CustomerDue created for remainder), running balance correctness, race condition (concurrent debits — one succeeds, one throws).

**`fcfsEngine.test.js`** — sufficient stock (all orders fully allocated), exact stock (last customer gets the exact remainder), shortfall (correct cutoff, subsequent customers receive zero), weight rounding (2 decimal places), count rounding (`Math.floor`, not `Math.round`), re-run after operator quantity correction (previous allocation overwritten).

**`parser.test.js`** — clean English text, Tamil token via synonym table, abbreviation mapping, voice note (`media_type !== 'text'`, parser not called), zero-parse (returns `manual_required`), "same as last week" trigger phrase (returns early, no history retrieval), multi-line order (each segment parsed independently).

**`stateMachineGuard.test.js`** — every permitted action in its permitted states (passes), every action in a non-permitted state (returns 409 with correct shape), each transition gate with blocking conditions present (returns blockers list), each transition gate with all conditions met (transition succeeds).

---

### E2 — Integration Test Spec
**Input for:** Cursor  
**Produced by:** Developer  
**Depends on:** B7, E1

Define the integration test suite that runs against the real API with a test MongoDB database. This is the primary regression guard for financial logic and the state machine.

**Full week lifecycle test**: scripted sequence from `POST /weeks` through all 6 state transitions to `closed`. At each step: assert the week state, assert key document states (order statuses, wallet balances), and assert the API rejects out-of-state actions. Final assertion: the `weekly_summaries` document totals match the sum of seeded transactions.

**Wallet race condition test**: two concurrent `debitForOrder` calls for the same customer with a balance sufficient for one but not both. Assert one call succeeds, one throws `WalletInsufficientError`, and the final wallet balance equals the single successful debit amount.

**Webhook deduplication test**: POST the same WhatsApp payload (same `message_id`) to the webhook endpoint twice. Assert only one `InboundMessage` document exists; the second call is discarded silently with no error response.

**State gate HTTP test**: attempt a write action in a non-permitted state via HTTP. Assert the 409 response shape matches `{ error: 'ACTION_NOT_PERMITTED_IN_STATE', currentState, permittedStates }`.

**Weekly summary aggregation test**: seed a complete week's `wallet_transactions`, `walkin_sales`, and `farmer_payments` with known values. Trigger the `reconciliation → closed` transition. Assert the generated `weekly_summaries` document totals match the manually calculated expected values.

---

## Category F — Operational

All outside Cursor. F3 is split into two separate tasks with different owners and timelines.

---

### F1 — Infrastructure Setup Runbook
**Outside Cursor**  
**Owner:** Developer  
**When:** Sprint 0 — before any deployment or webhook testing

Step-by-step provisioning:

- **MongoDB Atlas**: create M0 free cluster in AWS Singapore (`ap-southeast-1`), set IP allowlist to `0.0.0.0/0`, copy connection string, set as `MONGODB_URI` secret
- **Firebase**: create project on Spark plan, enable email/password authentication, generate service account JSON, base64-encode it, set as `FIREBASE_SERVICE_ACCOUNT_JSON` secret
- **Fly.io**: run `fly launch`, select Singapore region (`sin`), set all secrets via `fly secrets set`, confirm the app is running and not spinning down
- **GitHub Actions**: configure the workflow file for `npm test` + `fly deploy` on push to `main`

This runbook must be completed before C4 can proceed — Meta webhook registration requires a live Fly.io URL.

---

### F2 — User Account Creation
**Outside Cursor**  
**Owner:** Developer  
**When:** Before go-live

Define the `scripts/create-user.js` script used to create operator and volunteer accounts:

- Firebase Admin SDK call to create user with email + password
- Custom claim assignment: `{ role: 'operator' }` or `{ role: 'volunteer' }`
- Output: confirmation of UID and role set
- Usage: `node scripts/create-user.js --email=<email> --role=<operator|volunteer>`

Include the secure credential handoff procedure: how the operator and each volunteer receive their login credentials, and what they do on first login.

---

### F3a — Seed Script
**Input for:** Cursor**  
**Owner:** Developer  
**When:** After B1 (schema) is complete; data comes from F3b

Define `scripts/seed.js` — a Cursor-generated script that imports structured JSON files and writes them to MongoDB. Spec covers: which collections are seeded, the expected JSON file structure for each collection in `scripts/seed-data/`, idempotency behaviour (safe to re-run: upsert on unique fields, do not create duplicates), and the run command.

The data consumed by this script is produced in F3b.

---

### F3b — Seed Data Gathering
**Outside Cursor — operator session**  
**Owner:** Developer + Operator  
**When:** 2–3 weeks before go-live

Joint session to gather and structure all go-live seed data into JSON files in `scripts/seed-data/`:

- ~50 registered customer records: name, WhatsApp phone number
- ~15 outstation farmer records: name, phone, location/village, type
- ~5–10 local farmer records: name, phone, location/village, type
- Product catalogue: ~20–30 items with English names, Tamil names where known, default unit types
- Initial synonym table entries from the operator's existing WhatsApp order history (Tamil tokens and abbreviations — coordinate with F4)

Output files are consumed by the F3a seed script.

---

### F4 — Synonym Table Review
**Outside Cursor — operator session**  
**Owner:** Developer + Operator  
**When:** 2–3 weeks before go-live — run in the same session as F3b

Review the operator's existing WhatsApp order history (past 3–6 months) to extract:

- Tamil product name variants used by actual customers
- Product name abbreviations (e.g. "cauli" for cauliflower, "tom" for tomato)
- Common misspellings that the operator currently recognises manually
- Unit abbreviations not already in the parser's default synonym table

Record all findings in the synonym table JSON format and include them in the `config/synonyms` seed document. Parser accuracy on go-live week is directly proportional to the completeness of this table.

---

### F5 — Opening Balance Entry
**Outside Cursor**  
**Owner:** Developer  
**When:** Before the first week is closed on the live system

Define the one-time admin script or screen that allows the operator to enter the opening cash and bank balance at go-live. This populates `market_weeks.opening_balance_cash` and `market_weeks.opening_balance_bank` for the first week.

Spec covers: input validation (both values must be non-negative integers in paise), confirmation step before write, what happens if skipped (summary will show zero opening balance — incorrect but not fatal to other data). Single-use and must be correct — an error here propagates into every subsequent weekly summary's carry-forward balance.

---

### F6 — Manual Backup Procedure
**Outside Cursor**  
**Owner:** Developer (documents); Operator (executes weekly)  
**When:** Document before go-live; execute every week after market close

Define:

- The `mongoexport` command for each critical collection: `customers`, `customer_orders`, `wallet_transactions`, `market_weeks`, `weekly_summaries`
- Output location: a designated folder in the repository or a free-tier object store (e.g. Google Drive folder shared with the operator)
- File naming convention: `<collection>_<YYYY-MM-DD>.json`
- Retention policy: keep the last 4 weekly exports; delete older files
- Who runs it and when: after the operator closes the week in the system

Atlas M0 has no automated backups. This procedure is the only recovery option if the cluster has a data integrity issue.

---

### F7 — Go-Live Smoke Test Checklist
**Outside Cursor**  
**Owner:** Developer  
**When:** Final gate before the first real market week

A checklist of 15–20 specific actions that confirm the system is fully operational. Every item must pass before handing the system to the operator.

Covers:

- **Auth**: operator login succeeds; volunteer login succeeds; volunteer cannot access operator routes (receives 403)
- **Week setup**: create a week, add produce list items, publish — confirm state moves to `open`
- **Webhook**: send a test WhatsApp message from the operator's personal phone to the registered business number; confirm the message appears in the intake queue within 30 seconds
- **Order intake**: approve a test order; confirm wallet is debited; confirm `fcfs_timestamp` on the `CustomerOrder` matches the WhatsApp API payload timestamp (not server time)
- **State gates**: attempt an out-of-state action; confirm 409 response with correct error shape
- **Volunteer**: log in as volunteer; view packing list; enter a delivered quantity
- **FCFS**: set up a shortfall scenario (delivered qty less than total ordered); confirm allocation is correct and follows FCFS order
- **Market day**: record a walk-in sale; mark a test order as dispatched
- **Reconciliation**: confirm a price difference; mark an outstation farmer payment
- **Week close**: close the test week; confirm `weekly_summaries` document is created with correct totals
- **Volunteer PWA performance**: open volunteer screens on a real low-end Android device on a mobile data connection; confirm each screen loads in under 8 seconds; confirm all touch targets are reachable without pinch-zoom

---

## Summary Table

| # | Spec | Category | Produced By | Input For | Status |
|---|---|---|---|---|---|
| A1 | CLAUDE.md | Foundation | Developer | Cursor | ✅ Complete |
| A2 | Style Reference | Foundation | Developer | Cursor | — |
| A3 | Translations & Bilingual Content | Foundation | Developer + Operator | Cursor | — |
| A4 | Error Constants | Foundation | Developer | Cursor | — |
| A5 | `.env.example` | Foundation | Developer | Cursor + Outside | — |
| B1 | Database Schema | Backend | Developer | Cursor | — |
| B2 | State Machine | Backend | Developer | Cursor | — |
| B3 | Wallet Engine | Backend | Developer | Cursor | — |
| B4 | FCFS Allocation Engine | Backend | Developer | Cursor | — |
| B5 | Rule-Based Parser | Backend | Developer | Cursor | — |
| B7 | API Route Contracts | Backend | Developer | Cursor | — |
| C1 | WhatsApp Payload Schema | Integration | Developer | Cursor | — |
| C2 | WhatsApp Webhook Pipeline | Integration | Developer | Cursor | — |
| C3 | SSE Stream | Integration | Developer | Cursor | — |
| C4 | Meta Platform Setup | Integration | Developer + Operator | Outside Cursor | — |
| C5 | WhatsApp Message Templates | Integration | Developer + Operator | Outside Cursor | — |
| D1 | Operator Screen Specs ×9 | UI/UX | Developer | Cursor | — |
| D2 | Volunteer Screen Specs ×3 | UI/UX | Developer | Cursor | — |
| D3 | State Transition UX | UI/UX | Developer | Cursor | — |
| D4 | Async Feedback & Notifications | UI/UX | Developer | Cursor | — |
| E1 | Unit Test Cases | Testing | Developer | Cursor | — |
| E2 | Integration Test Cases | Testing | Developer | Cursor | — |
| F1 | Infrastructure Setup Runbook | Operational | Developer | Outside Cursor | — |
| F2 | User Account Creation | Operational | Developer | Outside Cursor | — |
| F3a | Seed Script | Operational | Developer | Cursor | — |
| F3b | Seed Data Gathering | Operational | Developer + Operator | Outside Cursor | — |
| F4 | Synonym Table Review | Operational | Developer + Operator | Outside Cursor | — |
| F5 | Opening Balance Entry | Operational | Developer | Outside Cursor | — |
| F6 | Manual Backup Procedure | Operational | Developer | Outside Cursor | — |
| F7 | Go-Live Smoke Test Checklist | Operational | Developer | Outside Cursor | — |

**27 specs. 19 Cursor inputs. 8 outside Cursor actions.**

---

## Production Sequence

```
NOW
  A1  ✅ Complete

WEEK 1 — Backend foundation
  B1        Database Schema
  B2+B3+B4  State Machine + Wallet Engine + FCFS  (write as a cluster)
  ────────────────────────────────────────────────────────────────────
  PARALLEL  F1  Infrastructure Setup Runbook  (long lead — start now)
  PARALLEL  C4  Meta Platform Setup           (approval can take weeks)

WEEK 2 — Backend completion + integration
  B5        Rule-Based Parser
  B7        API Route Contracts               (after B2–B5 locked)
  C1+C2+C3  WhatsApp specs                   (parallel with B7)
  A2        Style Reference                  (append to CLAUDE.md)
  A3        Translations & Bilingual Content

WEEK 3 — UI/UX specs
  D3        State Transition UX              (spec first — referenced by D1)
  D1        Operator Screen Specs ×9         (Order Intake Queue first)
  D2        Volunteer Screen Specs ×3
  D4        Async Feedback & Notifications
  A4+A5     Error Constants + .env.example   (quick — fold into this week)

WEEK 4 — Testing specs + begin coding
  E1        Unit Test Spec
  E2        Integration Test Spec
  ──────────────────────────────────────────────────────────────────
  START     Backend coding: Mongoose models (B1) → walletEngine,
            stateMachineGuard, fcfsEngine (B2/B3/B4) → parser (B5)

2–3 WEEKS BEFORE GO-LIVE
  F3b       Seed Data Gathering              (operator session)
  F4        Synonym Table Review             (same session as F3b)
  F3a       Seed Script                      (Cursor task, after F3b)
  F5        Opening Balance Entry

NEAR GO-LIVE
  F2        User Account Creation
  F6        Manual Backup Procedure
  C5        WhatsApp Message Templates       (operator sign-off)
  F7        Go-Live Smoke Test Checklist
```

---

*B2C Farmer Marketplace — Gudalur–Ooty. April 2026.*
