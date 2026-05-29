# Build Guide — B2C Farmer Marketplace
**Project:** Community Organic Farmer Marketplace, Gudalur–Ooty
**Version:** 1.0 — April 2026
**Covers:** Outside-Cursor action plan (all phases) + Cursor prompt library (B1 through C3, A2, A3)

---

## How to Use This Document

**Part 1 — Outside-Cursor Action Plan** is a sequenced checklist of every manual action required to bring the system to life. Execute these in order. Items marked 🔴 LONG LEAD are time-sensitive with external dependencies — start them immediately.

**Part 2 — Cursor Prompt Library** contains one ready-to-paste prompt per spec. Open the relevant spec document in your editor, paste the prompt into Cursor's composer, and run. Each prompt follows this structure:
1. WHAT TO BUILD
2. SPEC REFERENCE
3. CONSTRAINTS
4. DELIVERABLE

Do not run a Cursor prompt until all its dependencies (listed in SPEC REFERENCE) are confirmed complete.

---

---

# PART 1 — OUTSIDE-CURSOR ACTION PLAN

---

## ⚠️ TIME-SENSITIVE ITEMS — START IMMEDIATELY

> These two items have external lead times that are outside your control. Everything else in Week 1 and Week 2 can proceed in parallel, but **F1 must be live before C4 can start**, and **C4 approval can take 1–2 weeks from Meta**. Do not defer these.

---

### 🔴 F1 — Infrastructure Setup Runbook
**Owner:** Developer
**When:** Sprint 0 — before any deployment or webhook testing
**Blocked until:** Nothing — start now
**Blocks:** C4 (Meta webhook registration requires a live Fly.io URL)

**Checklist:**

#### MongoDB Atlas
- [ ] Create a free account at https://cloud.mongodb.com
- [ ] Create a new project
- [ ] Create a free M0 cluster — select **AWS / ap-southeast-1 (Singapore)** region
- [ ] Under Network Access → Add IP Address → allow `0.0.0.0/0` (MVP simplicity)
- [ ] Under Database Access → create a database user with a strong password
- [ ] Copy the connection string — format: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>`
- [ ] Save this as `MONGODB_URI` — do not commit to source control

#### Firebase
- [ ] Create a new project at https://console.firebase.google.com — select **Spark (free) plan**
- [ ] Enable **Authentication → Sign-in method → Email/Password**
- [ ] Go to Project Settings → Service Accounts → Generate new private key
- [ ] Download the JSON file
- [ ] Base64-encode it: `base64 -i serviceAccountKey.json | tr -d '\n'`
- [ ] Save the encoded string as `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] Save the project ID as `FIREBASE_PROJECT_ID`

#### Fly.io
- [ ] Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
- [ ] Create a free account at https://fly.io and authenticate: `fly auth login`
- [ ] In the project root, run: `fly launch`
  - App name: choose a name (e.g., `gudalur-market`)
  - Region: select **sin (Singapore)**
  - Do not deploy yet
- [ ] Set all secrets:
  ```
  fly secrets set MONGODB_URI="<value>"
  fly secrets set FIREBASE_PROJECT_ID="<value>"
  fly secrets set FIREBASE_SERVICE_ACCOUNT_JSON="<base64-value>"
  fly secrets set WHATSAPP_APP_SECRET="<value — set this before C4>"
  fly secrets set WHATSAPP_VERIFY_TOKEN="<value — choose a random string>"
  fly secrets set PORT=8080
  fly secrets set NODE_ENV=production
  ```
- [ ] Deploy: `fly deploy`
- [ ] Confirm app is running: `fly status` — should show 1 VM running, not sleeping
- [ ] Note the app URL: `https://<app-name>.fly.dev` — needed for C4

#### GitHub Actions
- [ ] In the repo, create `.github/workflows/deploy.yml`:
  ```yaml
  name: Test and Deploy
  on:
    push:
      branches: [main]
  jobs:
    test-and-deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: 20
        - run: npm ci
        - run: npm test
        - uses: superfly/flyctl-actions/setup-flyctl@master
        - run: fly deploy --remote-only
          env:
            FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  ```
- [ ] Add `FLY_API_TOKEN` to GitHub repo secrets (get from `fly tokens create deploy`)
- [ ] Push to `main` and confirm the workflow passes

**✅ F1 Complete when:** Fly.io VM is running, accessible at its URL, and a push to `main` triggers a successful deploy pipeline.

---

### 🔴 C4 — Meta Business Platform Setup
**Owner:** Developer + Operator
**When:** Start immediately after F1 is complete — Meta account approval can take 1–2 weeks
**Blocked until:** F1 (Fly.io deployment must be live to register the webhook URL)
**Blocks:** Live WhatsApp message intake (but system can be built and tested without it)

**Checklist:**

- [ ] **Verify or create Meta Business account** at https://business.facebook.com
  - If the operator already has a Facebook Business account, use it
  - Business verification may be required — submit business documents if prompted
- [ ] Go to https://developers.facebook.com → Create App → select **Business** type
- [ ] Add the **WhatsApp** product to the app
- [ ] Under WhatsApp → Getting Started:
  - [ ] Add the operator's WhatsApp phone number as a Business phone number
  - [ ] Verify the phone number via OTP
- [ ] Note the following values from the dashboard:
  - `WHATSAPP_APP_SECRET` — found under App Settings → Basic → App Secret
  - `WHATSAPP_PHONE_NUMBER_ID` — found under WhatsApp → Getting Started
- [ ] Ensure `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` are already set as Fly.io secrets (done in F1)
- [ ] Under WhatsApp → Configuration → Webhook:
  - [ ] Callback URL: `https://<app-name>.fly.dev/webhook/whatsapp`
  - [ ] Verify token: the same value set as `WHATSAPP_VERIFY_TOKEN` in Fly.io secrets
  - [ ] Click **Verify and Save** — the Fly.io server must be running to respond to the handshake
  - [ ] Subscribe to webhook field: **messages**
- [ ] Send a test WhatsApp message from a personal phone to the operator's registered business number
- [ ] Confirm the message appears in the operator intake queue in the PWA

**✅ C4 Complete when:** Webhook verification handshake succeeds AND a test message from a personal phone appears in the operator intake queue.

---

## WEEK 1 PARALLEL ACTIONS

> Run these alongside the Cursor spec-writing work for B1 and B2+B3+B4. No Cursor dependency.

*(F1 and C4 above are the primary Week 1 outside-Cursor items. No additional outside-Cursor actions are required in Week 1.)*

---

## 2–3 WEEKS BEFORE GO-LIVE

---

### F3b — Seed Data Gathering (Operator Session)
**Owner:** Developer + Operator — joint session required
**When:** 2–3 weeks before go-live; after B1 (schema) is complete so the developer knows the exact data shape
**Blocked until:** B1 spec complete (so developer knows exactly what fields to collect)
**Blocks:** F3a (Seed Script), F4 (Synonym Table Review — run in the same session)
**Duration:** Plan for 1–2 hours with the operator

**Session agenda:**

- [ ] **Customer list** — collect for each registered customer:
  - Full name
  - WhatsApp phone number (with country code, e.g., +91XXXXXXXXXX)
  - Opening wallet balance (if any customers have pre-existing credit to carry over)
- [ ] **Farmer list** — collect for each outstation and local farmer:
  - Full name
  - WhatsApp phone number
  - Location / village
  - Farmer type (outstation / local)
- [ ] **Product catalogue** — collect for each product:
  - Name in English
  - Name in Tamil
  - Default unit type (kg / 100g / piece / bunch)
- [ ] **Opening week** — confirm the first market week date

**Output:** Structured JSON files ready for F3a:
- `scripts/seed-data/customers.json`
- `scripts/seed-data/farmers.json`
- `scripts/seed-data/catalogue.json`

---

### F4 — Synonym Table Review (Operator Session)
**Owner:** Developer + Operator — run in the same session as F3b
**When:** Same session as F3b
**Blocked until:** F3b session scheduled
**Blocks:** Parser accuracy for Tamil tokens (system works without this but Tamil matches will fail)

**Session agenda:**

- [ ] Developer shows operator the pre-seeded English synonym table entries from B5
- [ ] Operator reviews and adds Tamil-language order phrase variants from actual customer WhatsApp history:
  - Common Tamil product names (e.g., கீரை for greens, தக்காளி for tomato)
  - Mixed Tamil/English abbreviations customers commonly use
  - Common misspellings or shorthand in the customer base
- [ ] Developer captures all additions as new rows in the synonym table JSON
- [ ] Table entries are added to `config/synonyms` MongoDB document via the seed script

**Output:** Updated `scripts/seed-data/synonyms.json` with Tamil token entries appended.

---

### F3a — Seed Script
**When:** After F3b data is collected
**Owner:** Developer (Cursor task — see Part 2, prompt F3a)

*(Outside-Cursor action: after Cursor generates the script, run it against the production MongoDB Atlas instance.)*

- [ ] Run: `node scripts/seed.js --env=production`
- [ ] Verify in MongoDB Atlas that all customers, farmers, and catalogue items are present
- [ ] Verify the `config/synonyms` document is populated

---

### F5 — Opening Balance Entry
**Owner:** Developer (one-time admin action)
**When:** After the first market week is created in the system, before it is closed
**Blocked until:** F3a complete and system deployed

- [ ] Use the admin endpoint or script to enter the opening cash and bank balance carried from the prior manual system
- [ ] Confirm the weekly summary for Week 1 reflects the correct opening balance

---

## NEAR GO-LIVE

---

### F2 — User Account Creation
**Owner:** Developer
**When:** 1–2 days before go-live
**Blocked until:** Firebase project is live (done in F1)

- [ ] For each operator user, run:
  ```
  node scripts/create-user.js --email=<email> --role=operator
  ```
- [ ] For each volunteer, run:
  ```
  node scripts/create-user.js --email=<email> --role=volunteer
  ```
- [ ] Share credentials securely — do not send passwords over WhatsApp
  - Recommended: share the temporary password verbally or via a one-time-use secure link
- [ ] Instruct each user to change their password on first login
- [ ] Confirm each user can log in and sees the correct role-scoped screen

---

### F6 — Manual Backup Procedure
**Owner:** Developer
**When:** Before go-live; run weekly thereafter

- [ ] Install `mongoexport` (included with MongoDB Database Tools)
- [ ] Create `scripts/backup.sh`:
  ```bash
  #!/bin/bash
  DATE=$(date +%Y-%m-%d)
  mongodump --uri="$MONGODB_URI" --out="backups/$DATE"
  echo "Backup complete: backups/$DATE"
  ```
- [ ] Run a test backup and confirm the output directory contains all collections
- [ ] Store backup files in a location outside the repo (e.g., Google Drive, local drive)
- [ ] Add to the operator's weekly checklist: run backup after every week is closed

---

### C5 — WhatsApp Message Templates (Operator Sign-Off Session)
**Owner:** Developer + Operator — joint session required
**When:** Near go-live — must be finalised before strings are committed to `translations.js`
**Blocked until:** A3 (translations.js) has been drafted by the developer

**Session agenda:**

- [ ] Review the drafted Tamil and English text for each template:
  - Weekly produce list (header + one line per item + footer)
  - Per-farmer consolidated order summary
  - Customer order confirmation (if used)
- [ ] Operator corrects any Tamil text that does not match how they would naturally write it
- [ ] Developer commits the finalised strings to `translations.js`

---

### F7 — Go-Live Smoke Test Checklist
**Owner:** Developer
**When:** Day of go-live, before announcing to customers

- [ ] Create a test customer account in the system
- [ ] Send a WhatsApp message from a personal phone to the operator number — confirm it appears in the intake queue
- [ ] Approve the parsed order — confirm it moves to Confirmed
- [ ] Record a wallet top-up — confirm the balance updates
- [ ] Advance the week through all 6 states from Setup → Closed
- [ ] Confirm the weekly summary is generated correctly
- [ ] Test operator login and volunteer login on the actual devices that will be used
- [ ] On a low-end Android phone on mobile data, load the volunteer packing list screen — confirm it loads in under 8 seconds

---

---

# PART 2 — CURSOR PROMPT LIBRARY

> Paste each prompt into Cursor's composer. Cursor reads CLAUDE.md automatically on every session — you do not need to paste CLAUDE.md contents into the prompt. The prompts reference CLAUDE.md by section number.

---

## WEEK 1 — PROMPT 1 of 5

---

### B1 — Database Schema

---

```
WHAT TO BUILD

Write the complete Mongoose schema spec for the B2C Farmer Marketplace. This is a specification document — not implementation code. Produce a single Markdown file that Cursor will read before generating any model files. The spec must cover all 13 collections plus the config collection, and must be complete enough that no schema decisions are left open when implementation begins.

SPEC REFERENCE

Source documents to read before writing:
- PRD.md Section 11 (Data Model) — primary reference for all collections and fields
- ARCHITECTURE.md Section 6 (Database Schema Mapping) — confirms embedding decisions and index requirements
- CLAUDE.md Section 15 (Indexes) — full list of required indexes, one per collection
- CLAUDE.md Section 4 (Paise Arithmetic Rules) — monetary field annotation rules
- CLAUDE.md Section 9 (Immutability Rules) — which fields must never be updated

Confirmed decisions to encode (do not reopen these):
- `line_items` is embedded as an array on `CustomerOrder` — it is NOT a separate collection
- `config/synonyms` is a single document with shape `{ _id: 'synonyms', table: [...] }` stored in a `config` collection — not a standalone collection
- All monetary fields: `type: Number, validate: { validator: Number.isInteger }` — annotate with comment `// paise integer — no floats`
- Every operator-action document must include `created_at: Date` and `created_by: String` (Firebase UID)
- All indexes listed in CLAUDE.md Section 15 must appear explicitly in the spec for each model file

The 13 collections (plus config):
1. farmers
2. customers
3. product_catalogue
4. market_weeks (includes embedded state_history array)
5. weekly_produce_items
6. customer_orders (with embedded line_items array)
7. wallet_transactions
8. inbound_messages
9. farmer_order_assignments
10. local_farmer_inbound
11. walkin_sales
12. farmer_payments
13. weekly_summaries
14. config (synonyms document)

For each collection, the spec must include:
- All field names with types and validation rules
- Embedding vs. reference decisions with rationale
- Index definitions (field, type, compound where applicable)
- Paise annotations on all monetary fields
- Audit fields (created_at, created_by) where applicable
- Immutability annotations on fields that must never be updated once written

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 4: All monetary values are integer paise. No floats anywhere in schema. Use `validate: { validator: Number.isInteger }` on every monetary field.
- Section 9: Wallet transaction records and order line items are immutable once written. Mark these fields in the spec with a comment: `// immutable — never updated after write`.
- Section 15: Every index listed in CLAUDE.md Section 15 must be present. Do not add indexes beyond those listed.
- Section 6 (Folder Structure): Model files will live at `server/models/<ModelName>.js`. The spec should list the exact file path for each model.

DELIVERABLE

File: `specs/B1-database-schema.md`

The file must be structured with one top-level section per collection. Each section contains: the model file path, the full field list with types and annotations, the index definitions, and any embedding notes. Conclude with a summary table listing all 14 collections/documents and their model file paths.
```

---

## WEEK 1 — PROMPT 2 of 5

---

### B2 + B3 + B4 — State Machine, Wallet Engine, FCFS Allocation Engine (Cluster)

---

```
WHAT TO BUILD

Write the combined backend spec for three interdependent modules: the State Machine Guard (B2), the Wallet Engine (B3), and the FCFS Allocation Engine (B4). These are written as one spec because the modules share runtime interfaces — the state machine gates routes that call wallet methods, and the FCFS engine is triggered at specific state transitions. Write all three in a single document with clearly headed sections. This is a specification document — not implementation code.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 5 (State Machine Exclusivity) — the stateMachineGuard plugin is the sole enforcer
- CLAUDE.md Section 6 (WalletEngine Exclusivity) — WalletEngine is the sole writer to wallet fields
- CLAUDE.md Section 7 (State-Action Gate Table) — the full PERMITTED_ACTIONS map
- CLAUDE.md Section 4 (Paise Arithmetic Rules) — all monetary parameters are integer paise
- CLAUDE.md Section 9 (Immutability Rules) — state_history array is append-only
- PRD.md Section 3.3 (State Machine) — the 7 states and 6 transitions with gate conditions
- PRD.md Section 7 (Wallet Rules) — wallet constraints, zero-floor rule, overdelivery edge case
- PRD.md Section 8 (FCFS Rules) — allocation algorithm and rounding rules
- ARCHITECTURE.md Section 4.2 (State Machine Enforcement Layer)
- ARCHITECTURE.md Section 4.3 (Wallet Engine)
- specs/B1-database-schema.md — must be complete before this spec is written

─────────────────────────────────────────────────
SECTION 1 — B2: STATE MACHINE GUARD
─────────────────────────────────────────────────

Define the `stateMachineGuard` Fastify plugin at `server/plugins/stateMachineGuard.js`.

The spec must define:

1. The 7 state constants as named exports:
   SETUP, OPEN, LOCKED, DELIVERY, MARKET_DAY, RECONCILIATION, CLOSED

2. The 6 legal transitions as named constants:
   SETUP→OPEN, OPEN→LOCKED, LOCKED→DELIVERY, DELIVERY→MARKET_DAY,
   MARKET_DAY→RECONCILIATION, RECONCILIATION→CLOSED

3. The full PERMITTED_ACTIONS map — every write route keyed as `METHOD /path/pattern` → array of permitted states. Every write route from CLAUDE.md Section 7 must be present. Read-only GET routes are not in this map.

4. One gate condition validator function per transition:
   - Function signature: `async validateTransition(weekId, targetState, db) → { ok: true } | { ok: false, blockers: [...] }`
   - For each transition: the exact MongoDB query used to check the gate condition
   - The blocker object structure: `{ type, id, label }` — type is the collection name, id is the document _id, label is the human-readable description shown in the UI
   - Gate conditions:
     * setup → open: produce list has at least 1 weekly_produce_item for this week
     * open → locked: zero customer_orders with status `pending_payment` for this week
     * locked → delivery: no gate condition — transition always permitted
     * delivery → market_day: no gate condition — transition always permitted
     * market_day → reconciliation: no gate condition — transition always permitted
     * reconciliation → closed: all price differences confirmed, all farmer_order_assignment payment statuses set (not null), all local_farmer_inbound payment amounts recorded

5. The 409 response shape for route-level state gate blocks:
   `{ error: 'ACTION_NOT_PERMITTED_IN_STATE', currentState: string, permittedStates: string[] }`

6. The state_history append pattern:
   Every transition appends `{ from, to, at: Date, by: string (Firebase UID) }` to `market_weeks.state_history`. This array is never overwritten — only appended.

Cross-references to encode in the spec:
- `applyBalancePayment` (B3) is only permitted in `market_day` state
- FCFS engine (B4) is triggered on `PATCH /weeks/:weekId/delivery/:assignmentId` in `delivery` state
- FCFS engine re-runs on `PATCH /weeks/:weekId/reconciliation/:assignmentId` in `reconciliation` state

─────────────────────────────────────────────────
SECTION 2 — B3: WALLET ENGINE
─────────────────────────────────────────────────

Define the WalletEngine module at `server/modules/walletEngine.js`.

The spec must define all 6 methods with complete input/output contracts:

```
topUp(customerId, amountPaise, channel, referenceNote, weekId, operatorId)
debitForOrder(customerId, orderValuePaise, orderId, weekId)
reverseOrderDebit(customerId, originalDebitTxnId, orderId)
applyPriceDiff(customerId, amountPaise, direction, lineItemId, weekId)
applyBalancePayment(customerId, amountPaise, channel, orderId, weekId)
manualAdjustment(customerId, amountPaise, direction, reason, operatorId)
```

For each method the spec must state:
- Full parameter list with types (all monetary parameters explicitly typed as integer paise)
- Preconditions
- The exact MongoDB operation used (atomic findOneAndUpdate vs. session-wrapped multi-write)
- Postconditions
- The error thrown on failure
- The exact WalletTransaction document written (all fields)

Critical edge cases — specify with exact MongoDB operation:

1. `debitForOrder` zero-floor constraint:
   Use atomic `findOneAndUpdate` with `{ wallet_balance: { $gte: amountPaise } }`.
   If the constraint fails, throw `WalletInsufficientError`.
   Never use read-then-write for this operation.

2. `applyPriceDiff` overdelivery two-step:
   When debit amount exceeds current balance:
   - Step 1: debit wallet to zero using `{ wallet_balance: { $gte: currentBalance } }` where currentBalance is the actual current balance read in this operation
   - Step 2: create a CustomerDue transaction for the remainder (amount = debit - currentBalance)
   - Both writes occur within a single MongoDB session

3. Running balance:
   Every WalletTransaction stores `running_balance` = balance after this transaction.
   Computed as `previousBalance ± amount`, written atomically with the balance update.

4. Startup assertion:
   On server start, WalletEngine runs a check that throws if any monetary argument passed to any method is non-integer. Include the assertion pattern in the spec.

5. Race condition outcome:
   Two concurrent `debitForOrder` calls with insufficient combined balance — one succeeds, one throws `WalletInsufficientError`. The atomic `$gte` pattern guarantees this without application-level locking. Document this explicitly so the test author can write the race condition test.

─────────────────────────────────────────────────
SECTION 3 — B4: FCFS ALLOCATION ENGINE
─────────────────────────────────────────────────

Define the FCFS Allocation Engine at `server/modules/fcfsEngine.js`.

The spec must define:

1. Trigger condition:
   Engine runs when `delivered_qty < sum(ordered_qty)` across all Confirmed CustomerOrders for the product in this week.
   Check is performed on `PATCH /weeks/:weekId/delivery/:assignmentId`.

2. No-op condition:
   When `delivered_qty >= sum(ordered_qty)`, engine does not run. All orders are fully satisfied at their ordered_qty.

3. The 5-step allocation algorithm:
   Step 1: Fetch all Confirmed CustomerOrder documents for this week that contain the shortfall product
   Step 2: Sort by `fcfs_timestamp ASC` (lowest = highest priority)
   Step 3: Walk the sorted list; allocate `ordered_qty` to each customer until `delivered_qty` is exhausted
   Step 4: The customer at the exhaustion point receives the remainder; all subsequent customers receive zero for this item
   Step 5: Write `delivered_qty` to each affected `OrderLineItem` embedded in `CustomerOrder`

4. Rounding rules:
   - Weight units (kg, 100g): round to 2 decimal places
   - Count units (piece, bunch): `Math.floor` — never `Math.round` — do not allocate fractional units

5. Re-run behaviour:
   When the operator edits `delivered_qty` in Reconciliation state, the engine re-runs for that item and overwrites all previous `OrderLineItem.delivered_qty` values for affected orders.

6. Function signature:
   `async runFcfsAllocation(weekId, productId, deliveredQty, db) → { allocated: [...], shortfall: boolean }`
   The return shape must list each affected customerId and their allocated quantity — used to generate the FCFS reallocation toast notification in the frontend.

CONSTRAINTS

Apply these CLAUDE.md rules across all three sections:
- Section 5: `stateMachineGuard` is the sole state enforcer. No route checks week state outside this plugin.
- Section 6: `WalletEngine` is the sole writer to `customers.wallet_balance` and the `wallet_transactions` collection. No other module writes these fields.
- Section 4: All monetary values are integer paise. No floats. All monetary method parameters are typed as integer in the spec.
- Section 9: `state_history` array on `market_weeks` is append-only. It is never overwritten or spliced.
- Section 8 (Error Handling): `WalletInsufficientError` throws with HTTP 422. `ActionNotPermittedInState` throws with HTTP 409. Both are named error classes from `server/lib/errors.js`.

DELIVERABLE

File: `specs/B2-B3-B4-state-wallet-fcfs.md`

Three headed sections (## B2 — State Machine Guard, ## B3 — Wallet Engine, ## B4 — FCFS Allocation Engine). Each section fully self-contained with all method signatures, MongoDB operations, error shapes, and cross-references to the other two modules where interfaces are shared.
```

---

## WEEK 2 — PROMPT 3 of 7

---

### B5 — Rule-Based Parser

---

```
WHAT TO BUILD

Write the complete spec for the rule-based parser module. This is a specification document — not implementation code. The parser is a pure JavaScript module with no external dependencies. It is invoked synchronously by the WhatsApp webhook handler immediately after message receipt.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 11 (Webhook Pipeline Sequence) — step 7 defines the parser invocation contract
- PRD.md Section 6 (Order Intake and Parsing) — parsing scope, fallback behaviour, synonym table
- decisions.md Decision 3 — confirmed parsing scope and fallback rules
- specs/B1-database-schema.md — the `config/synonyms` document structure

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 14 (No Runtime AI): The parser is rule-based only. No ML models, no third-party NLP APIs, no dynamic translation. Hard constraint — do not suggest alternatives.
- Section 4 (Paise): The parser does not handle monetary values. Not applicable to this spec.
- Section 12 (Synonym Table Cache): Loaded once at server startup from the `config/synonyms` MongoDB document. Cache reload triggered by `SIGHUP` or admin endpoint — no server restart required.

The spec must define:

1. Module location: `server/modules/parser.js`

2. Function signature:
   `parseMessage(rawMessage, produceList, synonymTable) → ParseResult[]`
   - `rawMessage`: raw string from the WhatsApp payload
   - `produceList`: `[{ product_id, name_en, name_ta, unit }]` — current week's active items
   - `synonymTable`: in-memory cache, loaded from `config/synonyms`
   - Returns an array of ParseResult objects, one per detected segment

3. ParseResult shape per segment:
   `{ rawText, productId, rawProductText, quantity, unit, confidence }`
   - `confidence` values: `'clean'` | `'partial'` | `'manual_required'`
   - `clean`: product matched + quantity extracted + unit extracted
   - `partial`: product matched but quantity or unit missing
   - `manual_required`: product unmatched OR zero items parsed

4. "Same as last week" pre-parse check:
   Before running the 5-step algorithm, test the entire message against a list of trigger phrases (English + Tamil).
   If matched, return immediately with `{ confidence: 'manual_required', reason: 'repeat_order' }`.
   Do not attempt history retrieval — this is post-MVP.
   List the English trigger phrases in the spec. Tamil trigger phrases are added after the F4 operator session.

5. Voice note and image handling:
   The parser is NOT called if `media_type !== 'text'`.
   The calling webhook handler (C2) sets `parse_status: 'voice_note'` or `parse_status: 'image'` directly.
   The spec must state this boundary explicitly so C2 and B5 implement it consistently.

6. The 5-step parsing algorithm:
   Step 1 — Segment split: split raw message on `[\n,;]+`
   Step 2 — Quantity extraction: extract numeric values including fractions (½, ¼), decimal notation, and spelled-out numbers (one, two, half)
   Step 3 — Unit extraction and normalisation: map abbreviations to canonical units
     - kg, kgs, kilo, kilogram → `kg`
     - g, gm, gms, gram, 100g → `100g`
     - pcs, pc, piece, pieces → `piece`
     - bunch, bun, bns → `bunch`
   Step 4 — Product text isolation: the remaining text after quantity and unit are removed
   Step 5 — Product match: match isolated text against produce list via synonym table lookup; if no match, set `confidence: 'manual_required'`

7. Initial synonym table entries to pre-seed (developer adds these before the F4 session):
   Standard English product name variants and abbreviations for the common produce types in the catalogue (e.g., "cauli" → cauliflower, "tom" → tomato, "beans" → french beans). List at minimum 15 entries covering the most common produce types. Tamil token entries are left blank with a comment: `// Tamil tokens added after F4 operator session`.

8. Synonym table cache pattern:
   - Loaded once at server startup: `const synonymCache = await db.collection('config').findOne({ _id: 'synonyms' })`
   - Stored in module scope
   - Reload function exported: `reloadSynonymCache(db)` — called on `SIGHUP` signal and by admin endpoint
   - Parser always uses the in-memory cache, never queries MongoDB per message

DELIVERABLE

File: `specs/B5-parser.md`

Sections: Module Overview, Function Signatures, ParseResult Shape, Pre-Parse Checks, 5-Step Algorithm (one subsection per step), Voice/Image Boundary, Synonym Table Structure, Cache Management, Initial Synonym Entries.
```

---

## WEEK 2 — PROMPT 4 of 7

---

### B7 — API Route Contracts

---

```
WHAT TO BUILD

Write the complete API route contracts spec. This is the last backend spec and must be written only after B1, B2, B3, B4, and B5 are all locked. This spec is what Cursor reads to implement every route in a single pass without interpretation gaps.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 7 (State-Action Gate Table) — every write route and its permitted states
- CLAUDE.md Section 8 (Auth Rules) — JWT role requirements per route
- CLAUDE.md Section 4 (Paise Arithmetic Rules) — monetary fields in request/response schemas
- specs/B1-database-schema.md
- specs/B2-B3-B4-state-wallet-fcfs.md
- specs/B5-parser.md
- ARCHITECTURE.md Section 4.1 (Route List)

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 7: Every write route must have an explicit state gate. Routes not in the PERMITTED_ACTIONS map are available in all states.
- Section 8: Every route specifies auth requirement — `JWT role: operator`, `JWT role: operator | volunteer`, or `HMAC-only` (webhook only).
- Section 4: All monetary fields in request body schemas typed as `integer` (paise). All monetary fields in response schemas include a note: serialised as integer paise; display layer divides by 100.
- Section 10 (Hard Constraints): No route accepts a payment notification from an external source. No route bypasses the state machine. No route writes to wallet fields outside WalletEngine.

For each route, the spec must define:
- HTTP method + full path
- Auth requirement
- State gate (permitted states from B2, or `none` for reads)
- Request schema: body fields with types and validation rules
- Response schema: fields with types
- Named error responses (use error class names from CLAUDE.md Section 8)

Include full request/response example pairs for these 5 routes:
1. `PATCH /api/v1/weeks/:weekId/intake/:messageId` — order intake approve
2. `POST /api/v1/customers/:customerId/wallet/topup` — wallet top-up
3. `PATCH /api/v1/weeks/:weekId/delivery/:assignmentId` — FCFS delivery entry
4. `PATCH /api/v1/weeks/:weekId/state` — state transition
5. The `reconciliation → closed` transition handler that generates the weekly summary

Weekly Summary Aggregation (include as a subsection within B7, not a separate spec):
- Collections joined: `wallet_transactions`, `walkin_sales`, `farmer_payments`, `market_weeks`
- Aggregation stages: `$match` by `week_id`, `$group` by channel and transaction type, sum fields per PRD Section 10.3 closing balance formula
- Output: a write-once `weekly_summaries` document
- Timing: runs once as part of the `reconciliation → closed` transition handler
- Immutability: once written, the `weekly_summaries` document is never updated

DELIVERABLE

File: `specs/B7-api-route-contracts.md`

Sections: Route Index (table of all routes), then one section per route group (Weeks, Customers, Farmers, Catalogue, Webhook, SSE, Admin). Conclude with the Weekly Summary Aggregation subsection.
```

---

## WEEK 2 — PROMPT 5 of 7

---

### C1 — WhatsApp Payload Schema

---

```
WHAT TO BUILD

Write the complete spec documenting the exact JSON structure of every inbound WhatsApp Cloud API message type the system receives. This is a reference document — not implementation code. The webhook handler (C2) is implemented using this spec, so it must be precise and complete.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 11 (Webhook Pipeline Sequence) — identifies the 5 fields extracted from every message
- ARCHITECTURE.md Section 5 (WhatsApp Integration Architecture)
- WhatsApp Cloud API documentation (canonical source for payload shapes)

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 11: The five fields extracted from every message type are: `message_id`, `sender_phone`, `body` (text only), `media_type`, `timestamp`. All other fields are read but not stored.
- Section 14 (No Runtime AI): No media content processing. Audio and image payloads are flagged as `voice_note` or `image` — their media content is never fetched or processed.
- The `timestamp` field is the FCFS timestamp source — it is the Unix seconds value from the WhatsApp platform, not the server receipt time. Document this explicitly with a callout.

The spec must cover:

1. All inbound message types with full payload shapes and field-level annotations:
   - text
   - audio (voice note)
   - image
   - document
   - sticker
   - reaction
   - location

   For each type: show the full JSON structure, annotate which fields the webhook handler reads, and mark unused fields as `// not read`.

2. How to extract the 5 required fields from each message type:
   - `message_id` → `entry[0].changes[0].value.messages[0].id`
   - `sender_phone` → `entry[0].changes[0].value.messages[0].from`
   - `body` → `entry[0].changes[0].value.messages[0].text.body` (text type only; null for all other types)
   - `media_type` → derived from `entry[0].changes[0].value.messages[0].type`
   - `timestamp` → `entry[0].changes[0].value.messages[0].timestamp` (Unix seconds — this is the FCFS timestamp)

3. The webhook verification handshake GET request:
   - Query parameters: `hub.mode`, `hub.verify_token`, `hub.challenge`
   - Expected handler behaviour: if `hub.mode === 'subscribe'` and `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` env var, respond with `hub.challenge` value as plain text with HTTP 200

4. The outer envelope structure that wraps all message types — document once, reference in each type section.

DELIVERABLE

File: `specs/C1-whatsapp-payload-schema.md`

Sections: Outer Envelope, Field Extraction Reference (the 5 fields with JSON paths), then one section per message type with annotated payload. Final section: Verification Handshake.
```

---

## WEEK 2 — PROMPT 6 of 7

---

### C2 — WhatsApp Webhook Pipeline

---

```
WHAT TO BUILD

Write the fully implementable spec for the WhatsApp webhook handler. This spec expands the 10-step pipeline from CLAUDE.md Section 11 into a step-by-step implementation guide for `server/routes/webhook.js`. It must be complete enough that Cursor implements the entire route in one pass without interpretation gaps.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 11 (Webhook Pipeline Sequence) — the 10-step pipeline is the authoritative source; this spec expands each step into exact code patterns
- specs/C1-whatsapp-payload-schema.md — must be complete before this spec is written
- specs/B1-database-schema.md — InboundMessage collection schema
- specs/B5-parser.md — parser invocation contract
- ARCHITECTURE.md Section 5.2 (Webhook Handler)

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 11: The pipeline sequence is fixed. Do not reorder steps. Step 1 (HMAC verification) and Step 2 (immediate 200 response) must always execute before any async work.
- Section 11, Step 2: The server responds HTTP 200 immediately before any async processing. This is non-negotiable — Meta will retry if a 200 is not received quickly.
- Section 11, Step 3: Async processing is enqueued using `setImmediate` after the 200 response is sent.
- Section 14 (No Runtime AI): Parser is rule-based only. No external service calls for parsing.
- Section 9 (Immutability): InboundMessage documents are written once and never updated by the pipeline. The parse_status field reflects the outcome of the single parse attempt.

For each of the 10 pipeline steps, the spec must provide:
- The exact code pattern (pseudocode at implementation fidelity — variable names, method calls, error handling)
- The MongoDB query used (where applicable) with the exact query shape
- What happens if this step fails (error handling)
- The expected outcome on success

The 10 steps:

Step 1 — HMAC verification:
Compute `HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET)`, compare to `X-Hub-Signature-256` header. Use `crypto.timingSafeEqual`. If mismatch → return HTTP 403, stop. Do not parse the body before this check.

Step 2 — Immediate 200 response:
`reply.code(200).send()` — send before any async work begins.

Step 3 — Async enqueue:
`setImmediate(async () => { ... })` wraps all subsequent steps.

Step 4 — Deduplication check:
Query `inbound_messages` collection for `{ message_id: extractedMessageId }`. If exists → discard silently, no error, no log entry beyond a debug line. If not exists → proceed.

Step 5 — Phone number match:
Query `customers` collection for `{ phone: senderPhone, active: true }`. If no match → set `customer_id: null`, set `parse_status: 'unknown_sender'`. Still write the InboundMessage (zero silent drops). Do not block or error.

Step 6 — Active week query:
Query `market_weeks` collection for `{ state: { $in: ['open', 'locked', 'delivery'] } }`. If no active week → set `week_id: null`, set `parse_status: 'no_active_week'`. Still write the InboundMessage.

Step 7 — Parser invocation:
If `media_type === 'text'` AND `customer_id !== null` AND `week_id !== null`:
  → Call `parseMessage(body, produceList, synonymCache)` from B5
  → Set `parse_result` and `parse_status` from parser output
If `media_type === 'audio'`:
  → Set `parse_status: 'voice_note'`, skip parser
If `media_type === 'image'`:
  → Set `parse_status: 'image'`, skip parser
For all other media types:
  → Set `parse_status: 'unsupported_type'`, skip parser

Step 8 — InboundMessage write:
Write one InboundMessage document to MongoDB. Fields: `message_id`, `sender_phone`, `customer_id`, `week_id`, `body`, `media_type`, `timestamp` (from WhatsApp payload — the FCFS timestamp), `received_at` (server time — `new Date()`), `parse_status`, `parse_result`, `created_at`.

Step 9 — SSE push:
After successful InboundMessage write, emit `new-message` event to all connected SSE clients via the connection map maintained by C3. Event payload: `{ messageId, senderPhone, customerName, parseStatus, receivedAt }`.

Step 10 — Error handling for the async block:
Wrap the entire `setImmediate` body in try/catch. On any unhandled error: log the error with the message_id, do not rethrow, do not surface to the client (the 200 has already been sent).

DELIVERABLE

File: `specs/C2-webhook-pipeline.md`

One section per pipeline step, numbered 1–10. Each section: step name, code pattern, MongoDB query (if applicable), failure handling, success outcome. A final section listing the InboundMessage document field map.
```

---

## WEEK 2 — PROMPT 7 of 7

---

### C3 — SSE Stream

---

```
WHAT TO BUILD

Write the complete spec for the Server-Sent Events (SSE) endpoint and the corresponding client-side hook. This covers both the server endpoint and the React hook used by the operator's intake queue screen. This is a specification document — not implementation code.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 11 (Webhook Pipeline Sequence) — Step 9 defines when the SSE push is triggered
- ARCHITECTURE.md Section 4.5 (SSE Architecture) and Section 12 (Out of Scope — WebSockets and change streams)
- specs/C2-webhook-pipeline.md — defines the SSE push call in Step 9

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 3 (Stack): SSE only — no WebSockets. MongoDB change streams are not available on Atlas M0 and must not be used.
- Section 5 (Single VM): All SSE connections are managed in a single in-memory connection map on the single Fly.io VM. No distributed pub/sub required.
- Section 8 (Auth): The SSE endpoint `GET /api/v1/events/intake-queue` requires JWT auth with operator role.

The spec must define:

─── SERVER SIDE: `GET /api/v1/events/intake-queue` ───

1. Required response headers:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
   - `X-Accel-Buffering: no` (disables Nginx buffering if a proxy is added later)

2. Connection map management:
   - Module-level `Map<connectionId, reply>` — keyed by a generated UUID per connection
   - On connect: add to map, send `connection-established` event
   - On client disconnect (`request.raw.on('close', ...)`): remove from map

3. Event types:
   - `connection-established`: sent once on connect. Payload: `{ connectedAt: ISO string }`
   - `new-message`: sent by the webhook pipeline (Step 9 of C2) when an InboundMessage is written. Payload: `{ messageId, senderPhone, customerName, parseStatus, receivedAt }`
   - `heartbeat`: sent every 30 seconds to keep the connection alive through proxies and load balancers. Payload: `{ at: ISO string }`

4. SSE event format (spec the exact wire format):
   ```
   event: new-message\n
   data: {"messageId":"...","senderPhone":"...","customerName":"...","parseStatus":"...","receivedAt":"..."}\n
   \n
   ```

5. How the webhook pipeline triggers the SSE push:
   The connection map must be exported from the SSE module and imported by the webhook route. The push function signature: `pushToAllClients(eventName, payload)` — iterates the connection map and writes to each reply.

─── CLIENT SIDE: `src/shared/hooks/useSSE.js` ───

6. EventSource initialisation:
   - URL: `/api/v1/events/intake-queue`
   - Auth: pass JWT token as query parameter `?token=<jwt>` (EventSource does not support custom headers)

7. Event handler wiring:
   - `connection-established` → log connection, update connection status state
   - `new-message` → call the `onNewMessage` callback passed to the hook
   - `heartbeat` → update last-heartbeat timestamp in hook state
   - `error` → update connection status to `reconnecting`

8. Reconnection behaviour:
   Native to EventSource — browser automatically retries on disconnect. No manual reconnection logic needed.

9. Polling fallback:
   If `typeof EventSource === 'undefined'` OR if connection fails after 3 consecutive errors:
   - Fall back to polling `GET /api/v1/weeks/:weekId/intake?status=pending` at 5-second intervals using `setInterval`
   - Set connection status to `polling`
   - Polling stops when the component unmounts (clear the interval in the cleanup function)

10. Hook return shape:
    `{ connectionStatus, lastHeartbeat }` where `connectionStatus` is `'connected' | 'reconnecting' | 'polling'`
    The hook accepts a callback prop: `useSSE({ weekId, onNewMessage: (messagePayload) => void })`

DELIVERABLE

File: `specs/C3-sse-stream.md`

Two sections: Server Side and Client Side. Server section covers endpoint definition, connection map, event types, wire format, and push function. Client section covers hook interface, EventSource setup, event handlers, reconnection, polling fallback, and return shape.
```

---

## WEEK 2 — PROMPT 8 of 8

---

### A2 — Style Reference (append to CLAUDE.md)

---

```
WHAT TO BUILD

Write a new section to be appended to CLAUDE.md defining the minimum visual contract for the UI. This is not a standalone file — it is Section 18 (or the next available section number) appended directly to CLAUDE.md. Cursor reads CLAUDE.md on every session, so these design tokens will be available automatically to all UI-related prompts.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md (existing) — read the current final section number so the new section is numbered correctly
- ARCHITECTURE.md Section 3 (Frontend Architecture) — confirms React + Vite + Tailwind stack
- context_v4.md Section 13 (Non-Functional Requirements) — Tamil + English language requirement, low-end Android device target for volunteers

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 3 (Stack): Tailwind CSS is the styling system. All component patterns use Tailwind utility classes.
- Section 3 (Stack): No component library (no shadcn, no MUI, no Chakra). Tailwind utilities only.
- Volunteer screen touch targets: 44px minimum on all interactive elements — enforced in CSS, not just in design.

The new CLAUDE.md section must define:

1. Colour palette — as CSS custom property names and hex values:
   Choose a palette appropriate for a working operator dashboard used in natural daylight on a tablet. Suggest earthy, legible tones that feel appropriate for an organic farmer marketplace. Define at minimum:
   - `--color-primary` (main action colour — buttons, active states)
   - `--color-primary-dark` (hover/pressed state)
   - `--color-secondary` (secondary actions)
   - `--color-surface` (card and panel backgrounds)
   - `--color-background` (page background)
   - `--color-error` (error states, destructive actions)
   - `--color-warning` (pending states, attention required)
   - `--color-success` (confirmed states, completed actions)
   - `--color-text-primary` (body text)
   - `--color-text-secondary` (labels, secondary text)

2. Typography:
   - Font stack: system font stack optimised for Android + macOS + Windows (no web font download required for operator screens)
   - Tamil font: specify the system font fallback chain for Tamil script rendering on Android (Noto Sans Tamil is present on Android 6+)
   - Size scale: base (16px), sm (14px), lg (18px), xl (24px), 2xl (32px)
   - Line height: 1.5 for body text, 1.2 for headings
   - Weight: regular (400) for body, medium (500) for labels, semibold (600) for headings

3. Spacing scale (4px base unit):
   - xs: 4px
   - sm: 8px
   - md: 16px
   - lg: 24px
   - xl: 32px
   - 2xl: 48px

4. Touch target rule:
   State as a hard rule: all interactive elements on volunteer screens must have a minimum height and width of 44px. Enforced via Tailwind class `min-h-[44px] min-w-[44px]` on every button, link, and tappable element in volunteer screens.

5. Tailwind component class conventions — specify the standard utility pattern for each:
   - Primary button
   - Secondary button
   - Destructive button
   - Badge (status indicator — pending, confirmed, locked, etc.)
   - Card (panel wrapper)
   - Input field
   - Modal overlay and modal container
   - Toast notification

6. State colour mapping — map each of the 7 week states to a badge colour:
   setup → grey, open → blue, locked → amber, delivery → purple, market_day → orange, reconciliation → red, closed → green

DELIVERABLE

Append to: `CLAUDE.md` as a new section titled `## Style Reference`

Do not create a new file. The output is the exact markdown text to paste as a new section at the end of the existing CLAUDE.md.
```

---

## WEEK 2 — PROMPT 9 of 9 (requires operator review before finalising)

---

### A3 — Translations and Bilingual Content

---

```
WHAT TO BUILD

Write the complete `translations.js` file containing every user-visible string in the system as a bilingual key-value object. This is a production source file — not a spec document. Every key must have both `en` and `ta` values.

⚠️ NOTE FOR DEVELOPER: The Tamil strings in this file are drafts generated from known translations. They MUST be reviewed and corrected by the operator before this file is committed to the codebase. Do not use these Tamil strings in production without operator sign-off. Schedule the review session after the file is generated.

SPEC REFERENCE

Source documents to read before writing:
- CLAUDE.md Section 3 (Stack) — confirms `src/shared/lib/translations.js` as the file path
- PRD.md Section 3.3 (State Machine) — the 7 state names
- PRD.md Section 7 (Wallet Rules) — wallet entry type labels
- All screen specs once written (D1, D2, D3, D4) will reference keys from this file — write keys defensively to cover all anticipated UI text

CONSTRAINTS

Apply these CLAUDE.md rules:
- Section 14 (No Runtime AI): All translations are static. No dynamic translation API calls. No i18n library that fetches translations at runtime. This file is the complete and only source of translated strings.
- Section 3: File path is `src/shared/lib/translations.js`. Export as a named export: `export const translations = { ... }`
- No hardcoded English strings anywhere in the codebase. Every component uses a key from this file.

The file must include keys covering:

1. Week state names (7 states):
   `week.state.setup`, `week.state.open`, `week.state.locked`, `week.state.delivery`,
   `week.state.market_day`, `week.state.reconciliation`, `week.state.closed`

2. State transition action button labels (6 transitions):
   `transition.setup_to_open.button`, `transition.open_to_locked.button`, etc.

3. State transition confirmation dialog copy (6 transitions):
   `transition.setup_to_open.confirm_title`, `transition.setup_to_open.confirm_body`, etc.

4. Blocker messages (one per gate condition type):
   `blocker.pending_payment_orders`, `blocker.empty_produce_list`,
   `blocker.unconfirmed_price_differences`, `blocker.unpaid_farmer_assignments`,
   `blocker.unrecorded_local_payments`

5. Order status labels:
   `order.status.pending_payment`, `order.status.confirmed`, `order.status.packed`,
   `order.status.dispatched`, `order.status.cancelled`

6. Wallet entry type labels (from PRD Section 7.2):
   `wallet.type.topup`, `wallet.type.order_debit`, `wallet.type.order_debit_reversal`,
   `wallet.type.price_diff_credit`, `wallet.type.price_diff_debit`,
   `wallet.type.customer_due`, `wallet.type.balance_payment`, `wallet.type.manual_adjustment`

7. Parse status labels:
   `parse.status.clean`, `parse.status.partial`, `parse.status.manual_required`,
   `parse.status.voice_note`, `parse.status.image`, `parse.status.unknown_sender`,
   `parse.status.no_active_week`

8. Common action button labels:
   `action.confirm`, `action.cancel`, `action.edit`, `action.delete`, `action.save`,
   `action.approve`, `action.reject`, `action.add`, `action.close`

9. Error messages (one per named error class from CLAUDE.md Section 8):
   `error.wallet_insufficient`, `error.action_not_permitted_in_state`,
   `error.transition_gate_blocked`, `error.duplicate_message`,
   `error.unknown_sender`, `error.week_not_found`, `error.order_not_found`,
   `error.customer_not_found`, `error.duplicate_phone`

10. Toast messages:
    `toast.fcfs_reallocation`, `toast.order_reverted_pending_payment`,
    `toast.topup_recorded`, `toast.order_confirmed`, `toast.week_state_changed`

11. WhatsApp-copyable templates (these are operator copy-paste templates, not UI labels):
    `template.produce_list.header`, `template.produce_list.item_line`,
    `template.produce_list.footer`, `template.farmer_order.header`,
    `template.farmer_order.item_line`, `template.farmer_order.footer`
    (C5 operator session will finalise the Tamil text for these — mark with a comment)

12. SSE connection status labels:
    `sse.status.connected`, `sse.status.reconnecting`, `sse.status.polling`

Generate best-effort Tamil translations for all keys. Mark any key where the translation is uncertain with a comment: `// TA: REVIEW REQUIRED`. All template strings (group 11) should be marked `// TA: CONFIRM WITH OPERATOR IN C5 SESSION`.

DELIVERABLE

File: `src/shared/lib/translations.js`

One exported `translations` object. Keys grouped by category with section comments. Every key has both `en` and `ta` values. Tamil review comments where applicable.
```

---

*Build Guide v1.0 — B2C Farmer Marketplace, Gudalur–Ooty — April 2026*
*Outside-Cursor: 9 action items across 4 phases. Cursor prompts: 9 prompts covering B1, B2+B3+B4, B5, B7, C1, C2, C3, A2, A3.*
