# B7 — API Route Contracts

**Status:** Locked (depends on B1, B2-state-machine, B2-wallet-engine, B4 FCFS, B5-parser)  
**Base URL:** `https://<host>/api/v1` (all routes below are prefixed with `/api/v1` unless noted)  
**Webhook base:** `https://<host>/webhook/whatsapp` (no `/api/v1` prefix)

**Normative sources:** `CLAUDE.md` §§4, 6, 7, 8, 10 · `specs/B1-database-schema.md` · `specs/B2-state-machine.md` · `specs/B2-wallet-engine.md` · `ARCHITECTURE.md` §4.1 · `PRD.md` §§3.3, 7, 10.3, 11

---

## Conventions

### Authentication

| Label | Meaning |
| --- | --- |
| `JWT role: operator` | `Authorization: Bearer <firebase-id-token>` required; `request.user.role === 'operator'` |
| `JWT role: operator \| volunteer` | JWT required; role is `operator` (all routes) or `volunteer` (explicit allowlist only) |
| `HMAC-only` | No JWT. `POST` validates `X-Hub-Signature-256`; `GET` validates `hub.verify_token` query param |
| `JWT role: any authenticated` | Used only for `POST /auth/verify` — any valid Firebase token |

Volunteer **write** allowlist (only these):

- `PATCH /api/v1/weeks/:weekId/delivery/:assignmentId`
- `PATCH /api/v1/weeks/:weekId/orders/:orderId/packed`
- `PATCH /api/v1/weeks/:weekId/orders/:orderId/dispatched`

Volunteer **read** allowlist (only these `GET`s):

- `GET /api/v1/weeks/:weekId`
- `GET /api/v1/weeks/:weekId/produce`
- `GET /api/v1/weeks/:weekId/delivery`
- `GET /api/v1/weeks/:weekId/packing`
- `GET /api/v1/weeks/:weekId/dispatch`
- `GET /api/v1/catalogue`

All other routes: **operator only** → volunteer receives `403` with `{ code: 'FORBIDDEN', httpStatus: 403 }`.

Unauthenticated requests → `401` `{ code: 'UNAUTHORISED', httpStatus: 401 }`.

### State gates

- **Write routes** map to a semantic action in `server/modules/stateMachine/constants.js` → `PERMITTED_ACTIONS`.
- **Read routes** use state gate `none` unless noted.
- Route-level block: HTTP **409**, body `{ code: 'ACTION_NOT_PERMITTED_IN_STATE', httpStatus: 409, message, details: { weekId, currentState, action, permittedStates } }` (class: `ActionNotAllowedError`).
- State transitions use a separate transition gate (see `PATCH .../state`).

### Money

- Request body monetary fields: JSON **`integer`** (paise), `minimum: 1` where amount must be positive.
- Response monetary fields: JSON **`integer`** (paise). **Display:** client divides by 100 only in `formatINR()` — never sent back to API.
- Fastify schemas reject non-integers at the boundary.

### Standard error envelope

All named errors serialize as:

```json
{
  "code": "<MACHINE_CODE>",
  "httpStatus": <number>,
  "message": "<human-readable>",
  "details": { }
}
```

### Success envelope

Unless noted, success responses are the resource object or `{ ok: true, ... }` with HTTP **200** (reads/patches) or **201** (creates).

### Idempotency

- `POST /customers/:customerId/wallet/topup` accepts optional `idempotencyKey` (string, max 128). Duplicate key with same parameters → return original result; different parameters → `WalletDuplicateOperationError` (409).

---

## Route Index

| # | Method | Path | Auth | State gate (action key) |
| --- | --- | --- | --- | --- |
| 1 | POST | `/api/v1/auth/verify` | JWT role: any authenticated | `none` |
| 2 | GET | `/api/v1/weeks` | JWT role: operator | `none` |
| 3 | POST | `/api/v1/weeks` | JWT role: operator | `none` (new week created in `setup`) |
| 4 | GET | `/api/v1/weeks/:weekId` | JWT role: operator \| volunteer | `none` |
| 5 | PATCH | `/api/v1/weeks/:weekId/state` | JWT role: operator | transition validator (not action map) |
| 6 | GET | `/api/v1/weeks/:weekId/produce` | JWT role: operator \| volunteer | `none` |
| 7 | POST | `/api/v1/weeks/:weekId/produce` | JWT role: operator | `add_produce_item` → setup, open |
| 8 | PATCH | `/api/v1/weeks/:weekId/produce/:itemId` | JWT role: operator | `edit_produce_price` → setup, open; `delete_produce_item` → setup only |
| 9 | GET | `/api/v1/weeks/:weekId/intake` | JWT role: operator | `none` |
| 10 | PATCH | `/api/v1/weeks/:weekId/intake/:messageId` | JWT role: operator | `confirm_order` → open |
| 11 | GET | `/api/v1/weeks/:weekId/orders` | JWT role: operator | `none` |
| 12 | POST | `/api/v1/weeks/:weekId/orders` | JWT role: operator | `create_order` → open |
| 13 | PATCH | `/api/v1/weeks/:weekId/orders/:orderId` | JWT role: operator | `edit_order` → open; `record_balance_payment` → market_day |
| 14 | DELETE | `/api/v1/weeks/:weekId/orders/:orderId` | JWT role: operator | `cancel_order` → open |
| 15 | GET | `/api/v1/weeks/:weekId/delivery` | JWT role: operator \| volunteer | `none` |
| 16 | PATCH | `/api/v1/weeks/:weekId/delivery/:assignmentId` | JWT role: operator \| volunteer | `set_farmer_assignments` → locked; `record_delivered_qty` → delivery; `edit_delivered_qty` → delivery, reconciliation |
| 17 | GET | `/api/v1/weeks/:weekId/packing` | JWT role: operator \| volunteer | `none` |
| 18 | PATCH | `/api/v1/weeks/:weekId/orders/:orderId/packed` | JWT role: operator \| volunteer | `pack_order` → delivery |
| 19 | PATCH | `/api/v1/weeks/:weekId/orders/:orderId/dispatched` | JWT role: operator \| volunteer | `dispatch_order` → market_day |
| 19b | GET | `/api/v1/weeks/:weekId/dispatch` | JWT role: operator \| volunteer | `none` |
| 20 | GET | `/api/v1/weeks/:weekId/walkin` | JWT role: operator | `none` |
| 21 | POST | `/api/v1/weeks/:weekId/walkin` | JWT role: operator | `record_walkin_sale` → market_day |
| 22 | POST | `/api/v1/weeks/:weekId/localfarmer-inbound` | JWT role: operator | `record_local_farmer_inbound` → market_day |
| 23 | GET | `/api/v1/weeks/:weekId/reconciliation` | JWT role: operator | `none` |
| 24 | POST | `/api/v1/weeks/:weekId/reconciliation/:diffId/confirm` | JWT role: operator | `confirm_price_diff` → reconciliation |
| 25 | GET | `/api/v1/weeks/:weekId/farmerpayments` | JWT role: operator | `none` |
| 26 | PATCH | `/api/v1/weeks/:weekId/farmerpayments/:paymentId` | JWT role: operator | `mark_outstation_farmer_payment` → reconciliation |
| 27 | GET | `/api/v1/weeks/:weekId/summary` | JWT role: operator | `view_weekly_summary` → closed |
| 28 | GET | `/api/v1/customers` | JWT role: operator | `none` |
| 29 | POST | `/api/v1/customers` | JWT role: operator | `register_entity` → all states |
| 30 | PATCH | `/api/v1/customers/:customerId` | JWT role: operator | `register_entity` → all states |
| 31 | GET | `/api/v1/customers/:customerId/wallet` | JWT role: operator | `view_wallet` → all states |
| 32 | POST | `/api/v1/customers/:customerId/wallet/topup` | JWT role: operator | `wallet_top_up` → setup, open, locked, delivery, market_day |
| 33 | GET | `/api/v1/farmers` | JWT role: operator | `none` |
| 34 | POST | `/api/v1/farmers` | JWT role: operator | `register_entity` → all states |
| 35 | PATCH | `/api/v1/farmers/:farmerId` | JWT role: operator | `register_entity` → all states |
| 36 | GET | `/api/v1/catalogue` | JWT role: operator \| volunteer | `none` |
| 37 | POST | `/api/v1/catalogue` | JWT role: operator | `register_entity` → all states |
| 38 | PATCH | `/api/v1/catalogue/:productId` | JWT role: operator | `register_entity` → all states |
| 39 | POST | `/webhook/whatsapp` | HMAC-only | `none` |
| 40 | GET | `/webhook/whatsapp` | HMAC-only (verify token) | `none` |
| 41 | GET | `/api/v1/events/intake-queue` | JWT role: operator | `none` |

**Hard constraints (all routes):** No external payment webhooks. No direct `market_weeks.state` or `customers.wallet_balance` writes outside state machine / WalletEngine respectively.

---

## Auth

### POST `/api/v1/auth/verify`

| | |
| --- | --- |
| **Auth** | JWT role: any authenticated |
| **State gate** | `none` |

**Purpose:** Verify Firebase ID token and return role claim for PWA routing.

**Request body:** `{}` (empty) — token taken from `Authorization` header only.

**Response 200:**

| Field | Type | Notes |
| --- | --- | --- |
| `uid` | string | Firebase UID |
| `email` | string | |
| `role` | string | enum: `operator` \| `volunteer` |

**Errors:** `401` if token invalid/expired.

---

## Weeks

### GET `/api/v1/weeks`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Query (optional):** `state` (string, filter), `limit` (integer, default 52), `offset` (integer, default 0).

**Response 200:**

```json
{
  "weeks": [
    {
      "weekId": "string",
      "marketDate": "ISO-8601 date",
      "state": "setup|open|locked|delivery|market_day|reconciliation|closed",
      "openingBalanceCash": "integer paise",
      "openingBalanceBank": "integer paise",
      "closedAt": "ISO-8601|null"
    }
  ],
  "total": "integer"
}
```

---

### POST `/api/v1/weeks`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` (document created with `state: 'setup'`) |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `marketDate` | string (date) | required, unique per `market_weeks.market_date` |
| `openingBalanceCash` | integer | required, paise, ≥ 0 |
| `openingBalanceBank` | integer | required, paise, ≥ 0 |

**Response 201:** Full week object (same shape as GET week detail).

**Errors:** `409` `DuplicateMarketDateError` if `market_date` exists; `400` `WalletValidationError` for non-integer money.

---

### GET `/api/v1/weeks/:weekId`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Params:** `weekId` (string, `market_weeks.week_id`).

**Response 200:**

| Field | Type | Notes |
| --- | --- | --- |
| `weekId` | string | |
| `marketDate` | string | |
| `state` | string | |
| `openingBalanceCash` | integer | paise |
| `openingBalanceBank` | integer | paise |
| `closedAt` | string \| null | |
| `stateHistory` | array | `{ fromState, toState, changedAt, changedBy, note? }` |
| `createdAt` | string | |
| `createdBy` | string | |

**Errors:** `MarketWeekNotFoundError` (404).

---

### PATCH `/api/v1/weeks/:weekId/state`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | Transition validator only (not `PERMITTED_ACTIONS`) |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `targetState` | string | required; must be legal next state from current |
| `note` | string | optional, max 500 |

**Behaviour:**

1. Load week; reject if `MarketWeekNotFoundError`.
2. `assertValidTransition(currentState, targetState)` — on failure: `InvalidStateTransitionError` (409), `code: 'INVALID_TRANSITION'`.
3. Run gate validator for edge `(current → target)`. On failure: `TransitionGateBlocked` (409) with `details.blockers[]`.
4. On success: `transitionWeekState` (sole writer for `state` / `state_history`). If `targetState === 'closed'`, run **Weekly Summary Aggregation** (see end of doc) in same transaction/session before commit.
5. Append `state_history` entry: `{ from_state, to_state, changed_at, changed_by, note? }`.

**Gate validators:**

| Transition | Query / rule | Blocker `type` |
| --- | --- | --- |
| `setup → open` | `weekly_produce_items.count({ week_id }) >= 1` | `NO_PRODUCE_ITEMS` |
| `open → locked` | `customer_orders.count({ week_id, status: 'pending_payment' }) === 0` | `PENDING_PAYMENT_ORDER` |
| `locked → delivery` | always pass | — |
| `delivery → market_day` | always pass | — |
| `market_day → reconciliation` | always pass | — |
| `reconciliation → closed` | (1) no line items with `difference_confirmed === false` and delivered ≠ ordered; (2) every outstation `farmer_payments` row for week has `status` set; (3) every `local_farmer_inbound` for week has payment recorded | `UNCONFIRMED_PRICE_DIFF`, `OUTSTATION_PAYMENT_INCOMPLETE`, `LOCAL_FARMER_PAYMENT_INCOMPLETE` |

**Blocker object shape:**

```json
{
  "type": "PENDING_PAYMENT_ORDER",
  "id": "<order_id>",
  "label": "Order for Rajesh — ₹250.00 pending payment"
}
```

**Response 200 (success):**

```json
{
  "ok": true,
  "weekId": "wk-2026-05-17",
  "previousState": "open",
  "newState": "locked",
  "week": { }
}
```

When `newState === 'closed'`, include:

```json
{
  "ok": true,
  "previousState": "reconciliation",
  "newState": "closed",
  "summary": { "summaryId": "...", "weekId": "...", "closingBalanceCash": 0, "closingBalanceBank": 0 }
}
```

**Response 409 (transition gate blocked):**

```json
{
  "code": "TRANSITION_GATE_FAILED",
  "httpStatus": 409,
  "message": "Transition to closed blocked",
  "details": {
    "weekId": "wk-2026-05-17",
    "currentState": "reconciliation",
    "targetState": "closed",
    "blockers": [
      { "type": "UNCONFIRMED_PRICE_DIFF", "id": "ord-001:li-003", "label": "Beans — Priya — difference not confirmed" },
      { "type": "OUTSTATION_PAYMENT_INCOMPLETE", "id": "fp-007", "label": "Farmer Murugan — payment status not set" }
    ]
  }
}
```

#### Example — state transition success

**Request:**

```http
PATCH /api/v1/weeks/wk-2026-05-17/state
Authorization: Bearer <token>
Content-Type: application/json

{ "targetState": "locked" }
```

**Response 200:**

```json
{
  "ok": true,
  "weekId": "wk-2026-05-17",
  "previousState": "open",
  "newState": "locked",
  "week": {
    "weekId": "wk-2026-05-17",
    "state": "locked",
    "marketDate": "2026-05-17T00:00:00.000Z"
  }
}
```

#### Example — state transition blocked (open → locked)

**Request:** `{ "targetState": "locked" }` while pending-payment orders exist.

**Response 409:**

```json
{
  "code": "TRANSITION_GATE_FAILED",
  "httpStatus": 409,
  "message": "Transition to locked blocked",
  "details": {
    "weekId": "wk-2026-05-17",
    "currentState": "open",
    "targetState": "locked",
    "blockers": [
      {
        "type": "PENDING_PAYMENT_ORDER",
        "id": "ord-9f2a",
        "label": "Anitha — ₹1,200.00 — pending payment"
      }
    ]
  }
}
```

#### Example — reconciliation → closed (summary generated)

**Request:**

```http
PATCH /api/v1/weeks/wk-2026-05-17/state
Content-Type: application/json

{ "targetState": "closed", "note": "Week 12 close" }
```

**Response 200:**

```json
{
  "ok": true,
  "weekId": "wk-2026-05-17",
  "previousState": "reconciliation",
  "newState": "closed",
  "summary": {
    "summaryId": "sum-wk-2026-05-17",
    "weekId": "wk-2026-05-17",
    "openingBalanceCash": 500000,
    "openingBalanceBank": 1200000,
    "preorderReceiptsCash": 850000,
    "preorderReceiptsBank": 320000,
    "marketDayReceiptsCash": 45000,
    "marketDayReceiptsBank": 12000,
    "walkinReceiptsCash": 280000,
    "walkinReceiptsBank": 95000,
    "walletAdjustmentsCredits": 15000,
    "walletAdjustmentsDebits": 8000,
    "outstationFarmerPaidCash": 400000,
    "outstationFarmerPaidBank": 200000,
    "localFarmerPaidCash": 180000,
    "localFarmerPaidBank": 0,
    "outstandingFarmerLiabilities": 75000,
    "outstandingCustomerDues": 12000,
    "closingBalanceCash": 955000,
    "closingBalanceBank": 1407000,
    "generatedAt": "2026-05-22T14:30:00.000Z"
  }
}
```

**Errors:** `MarketWeekNotFoundError`, `InvalidStateTransitionError`, `TransitionGateBlocked`, `MarketWeekStateMismatchError` (409 CAS race).

---

### GET `/api/v1/weeks/:weekId/produce`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Response 200:**

```json
{
  "items": [
    {
      "produceItemId": "string",
      "productId": "string",
      "nameEn": "string",
      "nameTa": "string|null",
      "unit": "kg|piece|bunch|100g",
      "pricePerUnit": "integer paise",
      "displayOrder": "integer"
    }
  ]
}
```

---

### POST `/api/v1/weeks/:weekId/produce`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `add_produce_item` → `setup`, `open` |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `productId` | string | required; must exist in catalogue |
| `unit` | string | required, enum |
| `pricePerUnit` | integer | required, paise, > 0 |
| `displayOrder` | integer | required, ≥ 0 |

**Response 201:** Created produce item object.

**Errors:** `ActionNotAllowedError`, `409` duplicate `(week_id, product_id)`.

---

### PATCH `/api/v1/weeks/:weekId/produce/:itemId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `edit_produce_price` → `setup`, `open`; soft-delete via `active: false` uses `delete_produce_item` → `setup` only |

**Request body (partial update):**

| Field | Type | Notes |
| --- | --- | --- |
| `pricePerUnit` | integer | paise; triggers order recalc per PRD §3.4 when state is `open` |
| `displayOrder` | integer | |
| `active` | boolean | `false` only in `setup` (delete) |

**Side-effect (open + price change):** Recalculate `order_value` on affected confirmed orders; insufficient wallet → revert order to `pending_payment` with flag (handled in route service, WalletEngine for debit adjustment).

**Response 200:** Updated item.

**Errors:** `ActionNotAllowedError`, `404` produce item not found.

---

### GET `/api/v1/weeks/:weekId/intake`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Query:** `queueStatus` optional enum `pending|approved|rejected`.

**Response 200:**

```json
{
  "messages": [
    {
      "messageId": "string",
      "senderPhone": "string",
      "customerId": "string|null",
      "customerName": "string|null",
      "body": "string|null",
      "mediaType": "text|audio|image|other",
      "fcfsTimestamp": "ISO-8601",
      "parseStatus": "string",
      "parsedItems": [],
      "queueStatus": "pending|approved|rejected",
      "operatorNotes": "string|null",
      "linkedOrderId": "string|null"
    }
  ]
}
```

---

### PATCH `/api/v1/weeks/:weekId/intake/:messageId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `confirm_order` → `open` |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `action` | string | required: `approve` \| `reject` |
| `lineItems` | array | required when `action === 'approve'`; min 1 |
| `operatorNotes` | string | optional |

**`lineItems[]` element:**

| Field | Type | Validation |
| --- | --- | --- |
| `productId` | string | required |
| `orderedQty` | number | required, ≥ 0 |
| `unit` | string | required, enum |

**Preconditions:** `InboundMessage.week_id === weekId`, `queue_status === 'pending'`. If already `approved` → `DuplicateMessageError` (409).

#### Branch: `action: 'reject'`

1. No `CustomerOrder` created.
2. Set `inbound_messages.queue_status = 'rejected'`, `operator_notes`, `processed_at`.
3. Document never deleted.

**Response 200:**

```json
{
  "ok": true,
  "messageId": "wamid.xxx",
  "queueStatus": "rejected"
}
```

#### Branch: `action: 'approve'`

1. **`fcfs_timestamp`:** copy `InboundMessage.fcfs_timestamp` → `CustomerOrder.fcfs_timestamp`. **Never** `new Date()` / server receipt time.
2. **`order_value`:** sum over `lineItems` of `orderedQty × weekly_produce_items.price_per_unit` (integer paise per line, then sum).
3. Create `CustomerOrder` (status initially `pending_payment` until debit outcome known).
4. **`WalletEngine.debitForOrder(customerId, orderValue, orderId, weekId)`**
   - **Debit succeeds:** `order.status = 'confirmed'`, `wallet_debited = order_value`, `balance_due = 0`; `InboundMessage.queue_status = 'approved'`.
   - **`WalletInsufficientError`:** `order.status = 'pending_payment'`, `wallet_debited = 0`, wallet **not** debited; `InboundMessage.queue_status = 'approved'`; response includes `shortfallAmount` (paise) = `order_value - customer.wallet_balance`.
5. Set `processed_at`, optional `operator_notes`.

**Response 200 (confirmed):**

```json
{
  "ok": true,
  "messageId": "wamid.HBgNMTIz",
  "queueStatus": "approved",
  "order": {
    "orderId": "ord-7c21",
    "status": "confirmed",
    "orderValue": 25000,
    "walletDebited": 25000,
    "fcfsTimestamp": "2026-05-17T09:14:32.000Z"
  }
}
```

**Response 200 (pending_payment):**

```json
{
  "ok": true,
  "messageId": "wamid.HBgNMTIz",
  "queueStatus": "approved",
  "order": {
    "orderId": "ord-7c22",
    "status": "pending_payment",
    "orderValue": 45000,
    "walletDebited": 0,
    "fcfsTimestamp": "2026-05-17T09:14:32.000Z"
  },
  "shortfallAmount": 12000
}
```

#### Example — approve, confirmed

**Request:**

```http
PATCH /api/v1/weeks/wk-2026-05-17/intake/wamid.HBgNMTIz
Content-Type: application/json

{
  "action": "approve",
  "lineItems": [
    { "productId": "prod-tomato", "orderedQty": 2, "unit": "kg" },
    { "productId": "prod-beans", "orderedQty": 1, "unit": "bunch" }
  ]
}
```

**Response 200:** (confirmed example above).

#### Example — approve, pending_payment

Same request when `wallet_balance = 33000` and `order_value = 45000`.

**Response 200:** (pending_payment example above; `shortfallAmount: 12000`).

**Errors:** `DuplicateMessageError` (409), `MarketWeekNotFoundError`, `ActionNotAllowedError`, `CustomerNotFoundError` if message has no `customer_id`, `404` message not found.

---

### GET `/api/v1/weeks/:weekId/orders`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Query:** `status`, `customerId` (optional filters).

**Response 200:** `{ "orders": [ CustomerOrder serialised ] }` — monetary fields integer paise.

---

### POST `/api/v1/weeks/:weekId/orders`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `create_order` → `open` |

**Purpose:** Create a customer order manually without an InboundMessage
(e.g. in-person request, or operator entry when no WhatsApp message
was received).

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `customerId` | string | required |
| `lineItems` | array | required, min 1 item |
| `lineItems[].productId` | string | required; must exist in weekly_produce_items for this weekId |
| `lineItems[].orderedQty` | number | required, > 0 |
| `lineItems[].unit` | string | required; enum kg / piece / bunch / 100g |

**Behaviour:**

1. Validate all productIds exist in weekly_produce_items for this week.
2. Calculate order_value: sum of (orderedQty × pricePerUnit) for each
   line item. pricePerUnit taken from weekly_produce_items, not from
   request body.
3. Set fcfs_timestamp = Date.now() — manual orders have no
   InboundMessage receipt time.
4. Call WalletEngine.debitForOrder(customerId, orderValuePaise, orderId, weekId).
   - Debit succeeds → order.status = 'confirmed'
   - WalletInsufficientError → order.status = 'pending_payment',
     wallet NOT debited, response includes shortfall_amount
5. Write CustomerOrder with embedded line_items. created_by =
   request.user.uid.

**Response 201:**

```json
{
  "orderId": "string",
  "status": "confirmed | pending_payment",
  "orderValue": "integer paise",
  "walletDebited": "integer paise",
  "shortfallAmount": "integer paise | null",
  "fcfsTimestamp": "ISO-8601"
}
```

**Errors:** `ActionNotAllowedError`, `CustomerNotFoundError`,
`400` if productId not in weekly_produce_items for this week.

---

### PATCH `/api/v1/weeks/:weekId/orders/:orderId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `edit_order` → `open`; **or** `record_balance_payment` → `market_day` when body contains `balancePayment` |

**Request body (edit — open only):**

| Field | Type | Notes |
| --- | --- | --- |
| `lineItems` | array | replaces all line items; min 1 |
| `notes` | string | optional |

**Behaviour (edit — open only):**

1. Recalculate `new_order_value` from the submitted lineItems
   × `weekly_produce_items.price_per_unit`.
2. Compare `new_order_value` to `old_order_value` on the
   existing order.

Branch A — new value > old value, wallet covers difference:
  - `diff = new_order_value - old_order_value`
  - Call `WalletEngine.debitForOrder(customerId, diff, orderId, weekId)`
  - Debit succeeds → order remains `confirmed`;
    `order_value` updated; `wallet_debited` increased by diff.

Branch B — new value > old value, wallet does NOT cover
difference (WalletInsufficientError thrown):
  - Call `WalletEngine.reverseOrderDebit(customerId,
    originalDebitTxnId, orderId)` to return original debit
  - Order status → `pending_payment`; `wallet_debited = 0`
  - Response includes `shortfallAmount` (paise)
  - Operator must top up wallet and re-confirm order.

Branch C — new value < old value (price decreased or items
removed):
  - `diff = old_order_value - new_order_value`
  - Call `WalletEngine.reverseOrderDebit(customerId,
    originalDebitTxnId, orderId)` for the full original debit
    amount to restore the full original debit to the wallet
  - Call `WalletEngine.debitForOrder(customerId,
    new_order_value, orderId, weekId)` for the new lower amount
  - Order remains `confirmed`; `order_value = new_order_value`;
    `wallet_debited = new_order_value`
  - Net effect: customer wallet is credited by diff (the
    reduction in order value)
  - Note: this is a reversal + re-debit pattern, not a partial
    credit. The two operations are wrapped in a MongoDB session
    to ensure atomicity.

Note: `fcfs_timestamp` is never changed by order edits.

**Request body (balance payment — market_day only):**

| Field | Type | Validation |
| --- | --- | --- |
| `balancePayment` | object | required for this mode |
| `balancePayment.amount` | integer | paise, > 0 |
| `balancePayment.channel` | string | `cash` \| `upi` |

**Behaviour (balance payment):** `WalletEngine.applyBalancePayment(...)`; set `balance_cleared` / `balance_due` on order per B3.

**Response 200:**

```json
{
  "ok": true,
  "orderId": "string",
  "status": "confirmed | pending_payment",
  "orderValue": "integer paise",
  "walletDebited": "integer paise",
  "shortfallAmount": "integer paise | null"
}
```

**Errors:** `ActionNotAllowedError`, `OrderNotFoundError` (404), `WalletInsufficientError` (Branch B path — 422 when wallet cannot cover the increased order value and reversal + pending_payment path is taken instead).

---

### DELETE `/api/v1/weeks/:weekId/orders/:orderId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `cancel_order` → `open` |

**Request body:** None.

**Behaviour:**

1. Load order; reject with `OrderNotFoundError` if not found or `week_id` does not match.
2. If `order.status === 'confirmed'`: call `WalletEngine.reverseOrderDebit(customerId, originalDebitTxnId, orderId)` to return the full debit to the customer wallet.
3. If `order.status === 'pending_payment'`: no wallet operation required.
4. Set `order.status = 'cancelled'`, `cancelled_at = now()`, `cancelled_by = request.user.uid`.
5. Order document is never deleted — status set to `cancelled` (immutability rule).

**Response 200:**

```json
{
  "ok": true,
  "orderId": "string",
  "status": "cancelled",
  "walletReversed": "integer paise | 0"
}
```

`walletReversed` is the paise amount credited back to the wallet (equals original `wallet_debited`; `0` if order was `pending_payment`).

**Errors:** `OrderNotFoundError` (404), `ActionNotAllowedError`, `WalletTransactionNotFoundError` (404 — original debit txn missing), `WalletDuplicateReversalError` (409 — already reversed).

---

### GET `/api/v1/weeks/:weekId/delivery`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Response 200:**

```json
{
  "assignments": [
    {
      "assignmentId": "string",
      "farmerId": "string",
      "farmerName": "string",
      "productId": "string",
      "productName": "string",
      "preorderQty": "number",
      "bufferPct": "number",
      "bufferQty": "number",
      "outgoingQty": "number",
      "deliveredQty": "number",
      "unit": "string",
      "aggregatedOrderedQty": "number",
      "shortfallFlag": "boolean"
    }
  ],
  "items": [
    {
      "produceItemId": "string",
      "productId": "string",
      "totalOrderedQty": "number",
      "totalDeliveredQty": "number"
    }
  ]
}
```

---

### PATCH `/api/v1/weeks/:weekId/delivery/:assignmentId`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | See dual mode below |

**Mode A — `locked` (`set_farmer_assignments`):** Upsert farmer assignment.

| Field | Type | Validation |
| --- | --- | --- |
| `farmerId` | string | required |
| `productId` | string | required |
| `preorderQty` | number | ≥ 0 |
| `bufferPct` | number | ≥ 0 |
| `bufferQty` | number | ≥ 0 |
| `outgoingQty` | number | ≥ 0 |

**Mode B — `delivery` / `reconciliation` (`record_delivered_qty` / `edit_delivered_qty`):**

| Field | Type | Validation |
| --- | --- | --- |
| `deliveredQty` | number | required, ≥ 0 |
| `overrideVolunteer` | boolean | optional; operator-only; default false |

**FCFS trigger (Mode B, `delivery` state):** After persisting `delivered_qty` on assignment, compute `sum(ordered_qty)` across **confirmed** `customer_orders` for `product_id`. If `delivered_qty < sum`, invoke `allocationEngine.allocate({ weekId, produceItemId, availableQty: deliveredQty })` and write allocated quantities to each affected `order.line_items[].delivered_qty`. If `delivered_qty >= sum`, FCFS no-op (all lines keep full ordered qty).

**Re-run:** In `reconciliation`, same PATCH recalculates FCFS (overwrites prior allocation for that product).

**Response 200:**

```json
{
  "ok": true,
  "assignmentId": "asgn-004",
  "deliveredQty": 8.5,
  "fcfsTriggered": true,
  "allocations": [
    { "orderId": "ord-001", "allocatedQty": 2, "requestedQty": 2, "unit": "kg" },
    { "orderId": "ord-002", "allocatedQty": 1.5, "requestedQty": 3, "unit": "kg" }
  ]
}
```

#### Example — FCFS shortfall trigger

**Request:**

```http
PATCH /api/v1/weeks/wk-2026-05-17/delivery/asgn-beans-murugan
Content-Type: application/json

{ "deliveredQty": 8.5 }
```

**Context:** Confirmed orders total 12 kg beans; volunteer records 8.5 kg received.

**Response 200:** (example above with `fcfsTriggered: true` and partial allocations).

**Errors:** `ActionNotAllowedError`, `404` assignment not found, `PRODUCE_ITEM_NOT_FOUND` (400) from FCFS engine.

---

### GET `/api/v1/weeks/:weekId/packing`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Response 200:** Per-customer cards with FCFS-adjusted quantities for packing.

```json
{
  "customers": [
    {
      "customerId": "string",
      "customerName": "string",
      "orders": [
        {
          "orderId": "string",
          "status": "confirmed|packed",
          "lineItems": [
            {
              "productId": "string",
              "nameEn": "string",
              "orderedQty": "number",
              "allocatedQty": "number",
              "unit": "string",
              "fcfsRank": "integer|null"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### PATCH `/api/v1/weeks/:weekId/orders/:orderId/packed`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `pack_order` → `delivery` |

**Request body:** `{}` or `{ "packedAt": "ISO-8601 optional" }`

**Behaviour:** `customer_orders.status`: `confirmed` → `packed` (only valid transition).

**Response 200:** `{ "ok": true, "orderId": "...", "status": "packed" }`

---

### PATCH `/api/v1/weeks/:weekId/orders/:orderId/dispatched`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `dispatch_order` → `market_day` |

**Behaviour:** `packed` → `dispatched`.

Precondition: order.status must equal 'packed'.
If order.status is not 'packed', return 409
`{ code: 'INVALID_ORDER_STATUS_TRANSITION',
  httpStatus: 409,
  message: 'Order must be packed before it can be dispatched',
  details: { orderId, currentStatus } }`

**Response 200:** `{ "ok": true, "orderId": "...", "status": "dispatched" }`

---

### GET `/api/v1/weeks/:weekId/dispatch`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Purpose:** Returns all packed orders for the current week for the
volunteer dispatch screen. Equivalent in shape to the packing list
but filtered to packed status and available in market_day state.

**Response 200:**

```json
{
  "orders": [
    {
      "orderId": "string",
      "customerId": "string",
      "customerName": "string",
      "status": "packed | dispatched",
      "balanceDue": "integer paise",
      "lineItems": [
        {
          "productId": "string",
          "nameEn": "string",
          "deliveredQty": "number",
          "unit": "string"
        }
      ]
    }
  ]
}
```

Note: balanceDue is read-only on this screen. Volunteer does not
record balance payments — that is an operator action
(PATCH .../orders/:orderId via record_balance_payment).

---

### GET `/api/v1/weeks/:weekId/walkin`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Response 200:** `{ "sales": [ WalkInSale serialised ] }` — `amountCollected` integer paise.

---

### POST `/api/v1/weeks/:weekId/walkin`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `record_walkin_sale` → `market_day` |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `qty` | number | required, ≥ 0 |
| `unit` | string | required |
| `pricePerUnit` | integer | required, paise, > 0 |
| `channel` | string | required, `cash` \| `upi` |
| `inventorySource` | string | required, `outstation` \| `local_farmer` |
| `productId` | string | optional, nullable |
| `itemName` | string | optional |
| `farmerId` | string | optional, nullable |
| `customerPhone` | string | optional (resolved to customerId server-side) |

> `amountCollected` is computed server-side as `Math.round(qty × pricePerUnit)` and is not a client field. `customerId` is resolved from `customerPhone` server-side; clients send `customerPhone`, not `customerId`.

**Response 201:** Immutable `walkin_sales` document (write-once).

**Errors:** `ActionNotAllowedError`.

---

### POST `/api/v1/weeks/:weekId/localfarmer-inbound`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `record_local_farmer_inbound` → `market_day` |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `farmerId` | string | required; local farmer |
| `productId` | string | nullable |
| `itemName` | string | required if no productId |
| `inboundQty` | number | ≥ 0 |
| `unit` | string | enum |
| `pricePerUnit` | integer | paise, > 0 |

**Response 201:** `local_farmer_inbound` record.

---

### GET `/api/v1/weeks/:weekId/reconciliation`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` (UI typically only in `reconciliation`; data readable whenever computed) |

**Response 200:**

```json
{
  "priceDifferences": [
    {
      "diffId": "ord-001:li-003",
      "orderId": "string",
      "lineItemId": "string",
      "customerId": "string",
      "customerName": "string",
      "productId": "string",
      "orderedQty": "number",
      "deliveredQty": "number",
      "differenceQty": "number",
      "pricePerUnit": "integer paise",
      "monetaryDifference": "integer paise",
      "differenceConfirmed": "boolean"
    }
  ],
  "localFarmerItems": [],
  "outstationPayments": []
}
```

`diffId` format: `{orderId}:{lineItemId}` (used by confirm route).

---

### POST `/api/v1/weeks/:weekId/reconciliation/:diffId/confirm`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `confirm_price_diff` → `reconciliation` |

**Request body:** `{}` (empty — confirmation applies computed difference).

**Behaviour:**

1. Parse `diffId` → `orderId`, `lineItemId`.
2. Load line; compute `monetaryDifference` in paise (integer).
3. If negative (shortfall): `WalletEngine.applyPriceDiff(..., direction: 'credit')` → `price_diff_credit`.
4. If positive (overdelivery): `WalletEngine.applyPriceDiff(..., direction: 'debit')` → `price_diff_debit` or overdelivery two-step (`customer_due`).
5. Set `line_items.$.difference_confirmed = true`.

**Response 200:**

```json
{
  "ok": true,
  "diffId": "ord-001:li-003",
  "differenceConfirmed": true,
  "walletTxnId": "txn-xxx",
  "customerDueCreated": false
}
```

**Errors:** `WalletInsufficientError` not exposed for overdelivery two-step (handled inside engine); `ActionNotAllowedError`, `OrderNotFoundError`.

---

### GET `/api/v1/weeks/:weekId/farmerpayments`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Response 200:**

```json
{
  "payments": [
    {
      "paymentId": "string",
      "farmerId": "string",
      "farmerName": "string",
      "amountDue": "integer paise",
      "status": "unpaid|partial|paid",
      "amountPaid": "integer paise",
      "outstanding": "integer paise",
      "channel": "cash|upi|null"
    }
  ]
}
```

---

### PATCH `/api/v1/weeks/:weekId/farmerpayments/:paymentId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `mark_outstation_farmer_payment` → `reconciliation` |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `status` | string | `unpaid` \| `partial` \| `paid` |
| `amountPaid` | integer | paise; required if partial/paid |
| `channel` | string | `cash` \| `upi`; required if partial/paid |

**Behaviour:** Update `farmer_payments`; `outstanding = amount_due - amount_paid`.

**Response 200:** Updated payment record.

---

### GET `/api/v1/weeks/:weekId/summary`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `view_weekly_summary` → `closed` |

**Implementation note:** This read route uses a direct state check (`if (week.state !== 'closed') → 404`) rather than `isActionAllowed` / `PERMITTED_ACTIONS`. The `view_weekly_summary` key in the action map is for documentation reference only — the route handler guards access by asserting `week.state === 'closed'` and returning 404 if the summary does not yet exist.

**Response 200:** `weekly_summaries` document (all monetary fields integer paise). **404** if week not closed or summary not yet generated.

---

## Customers

### GET `/api/v1/customers`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Query:** `active` (boolean, default true), `search` (phone/name substring).

**Response 200:** `{ "customers": [ { customerId, name, phone, walletBalance, active } ] }` — `walletBalance` integer paise.

---

### POST `/api/v1/customers`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `name` | string | required |
| `phone` | string | required, E.164 style, unique |
| `openingWalletBalance` | integer | optional paise, default 0 |

**Response 201:** Customer object.

**Errors:** `DuplicatePhoneError` (409).

---

### PATCH `/api/v1/customers/:customerId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:** `{ name?, phone?, active? }` — **must not** include `walletBalance` (WalletEngine only).

**Response 200:** Updated customer.

---

### GET `/api/v1/customers/:customerId/wallet`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `view_wallet` → all states |

**Query:** `weekId` (optional filter for ledger).

**Response 200:**

```json
{
  "customerId": "string",
  "walletBalance": "integer paise",
  "transactions": [
    {
      "txnId": "string",
      "type": "string",
      "amount": "integer paise",
      "channel": "string",
      "runningBalance": "integer paise",
      "weekId": "string|null",
      "referenceNote": "string|null",
      "createdAt": "ISO-8601"
    }
  ]
}
```

---

### POST `/api/v1/customers/:customerId/wallet/topup`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `wallet_top_up` → setup, open, locked, delivery, market_day |

**Request body:**

| Field | Type | Validation |
| --- | --- | --- |
| `amount` | integer | paise, > 0 |
| `channel` | string | `cash` \| `upi` |
| `referenceNote` | string | optional |
| `weekId` | string | required (active week context) |
| `idempotencyKey` | string | optional |

**Behaviour:**

1. `WalletEngine.topUp(...)`.
2. Query `customer_orders` where `customer_id` and `status === 'pending_payment'`.
3. Build `pendingOrdersNowCoverable`: orders where `order_value <= new wallet_balance` after top-up.
4. **Do not** auto-confirm those orders.

**Response 200:**

```json
{
  "ok": true,
  "txnId": "txn-a1b2",
  "walletBalance": 50000,
  "pendingOrdersNowCoverable": [
    { "orderId": "ord-7c22", "orderValue": 45000 },
    { "orderId": "ord-8d01", "orderValue": 12000 }
  ]
}
```

#### Example — top-up with coverable pending orders

**Request:**

```http
POST /api/v1/customers/cust-anitha/wallet/topup
Content-Type: application/json

{
  "amount": 20000,
  "channel": "upi",
  "referenceNote": "UPI ref 8821",
  "weekId": "wk-2026-05-17",
  "idempotencyKey": "topup-2026-05-22-001"
}
```

**Response 200:**

```json
{
  "ok": true,
  "txnId": "txn-9f3c",
  "walletBalance": 53000,
  "pendingOrdersNowCoverable": [
    { "orderId": "ord-7c22", "orderValue": 45000 }
  ]
}
```

**Errors:** `CustomerNotFoundError`, `WalletValidationError`, `WalletDuplicateOperationError`, `ActionNotAllowedError`.

---

## Farmers

### GET `/api/v1/farmers`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Query:** `farmerType` (`outstation|local`), `active`.

**Response 200:** `{ "farmers": [ ... ] }`

---

### POST `/api/v1/farmers`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:** `{ name, phone, location, farmerType }`

**Response 201:** Farmer object.

**Errors:** `DuplicatePhoneError` (409).

---

### PATCH `/api/v1/farmers/:farmerId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:** partial `{ name?, phone?, location?, active? }`

**Response 200:** Updated farmer.

---

## Catalogue

### GET `/api/v1/catalogue`

| | |
| --- | --- |
| **Auth** | JWT role: operator \| volunteer |
| **State gate** | `none` |

**Response 200:** `{ "products": [ { productId, nameEn, nameTa, defaultUnit, active } ] }`

---

### POST `/api/v1/catalogue`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:** `{ nameEn, nameTa?, defaultUnit }`

**Response 201:** Product object.

---

### PATCH `/api/v1/catalogue/:productId`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `register_entity` → all states |

**Request body:** partial update; `active: false` soft-deletes.

**Response 200:** Updated product.

---

## Webhook

### GET `/webhook/whatsapp`

| | |
| --- | --- |
| **Auth** | HMAC-only (Meta verification handshake) |
| **State gate** | `none` |

**Query params (Meta standard):**

| Param | Type |
| --- | --- |
| `hub.mode` | string |
| `hub.verify_token` | string — must equal `WHATSAPP_VERIFY_TOKEN` |
| `hub.challenge` | string |

**Response 200:** Plain text body = `hub.challenge` value (not JSON).

**Errors:** `403` if verify token mismatch.

---

### POST `/webhook/whatsapp`

| | |
| --- | --- |
| **Auth** | HMAC-only — `X-Hub-Signature-256: sha256=<hex>` over raw body with `WHATSAPP_APP_SECRET` |
| **State gate** | `none` |

**Request body:** WhatsApp Cloud API webhook JSON (see C1 spec). No monetary fields.

**Behaviour (strict order):**

1. Verify HMAC — fail → `403`.
2. Respond **200** immediately (empty body or `{ ok: true }`).
3. `setImmediate` async pipeline: extract `message_id`, `sender_phone`, `body`, `media_type`, `timestamp`; dedupe; match customer; find `state: 'open'` week; parse if text; insert `InboundMessage`; SSE push.

**Response 200:** Sent before async work completes.

**Errors:** `403` invalid signature. Duplicate `message_id` → silent no-op (still 200). **No** `UnknownSenderError` at HTTP layer — unknown senders still persist message.

---

## SSE (Admin / Real-time)

### GET `/api/v1/events/intake-queue`

| | |
| --- | --- |
| **Auth** | JWT role: operator |
| **State gate** | `none` |

**Headers:** `Accept: text/event-stream`

**Events:**

| Event | Payload |
| --- | --- |
| `new-message` | `{ messageId, weekId, customerId, queueStatus, fcfsTimestamp }` |
| `heartbeat` | `{ at: "ISO-8601" }` every 30s |

**Connection:** Long-lived SSE; client reconnects via `EventSource`.

**Errors:** `401`/`403` as standard.

---

## Weekly Summary Aggregation

**Timing:** Runs **once**, atomically as part of successful `reconciliation → closed` transition on `PATCH /api/v1/weeks/:weekId/state`. If transition fails, no summary is written. If summary insert fails, transition rolls back.

**Immutability:** `weekly_summaries` document is write-once; never updated or deleted.

### Collections

| Collection | Role |
| --- | --- |
| `market_weeks` | `opening_balance_cash`, `opening_balance_bank` |
| `wallet_transactions` | Receipts and wallet adjustments by `type` + `channel` |
| `walkin_sales` | Walk-in receipts by `channel` |
| `farmer_payments` | Outstation paid amounts and outstanding liabilities |
| `local_farmer_inbound` | Local farmer payment totals (operator-recorded payment fields) |
| `customer_orders` + ledger | Source for outstanding customer dues via `customer_due` txn type |

### Aggregation pipeline (normative)

**Step 1 — `$match`:** `{ week_id: weekId }` on each collection.

**Step 2 — Wallet receipts and adjustments (`wallet_transactions`):**

```javascript
// Preorder receipts
{ $match: { week_id, type: 'top_up' } },
{ $group: { _id: '$channel', total: { $sum: '$amount' } } }

// Market day receipts
{ $match: { week_id, type: 'balance_payment' } },
{ $group: { _id: '$channel', total: { $sum: '$amount' } } }

// Wallet adjustments (informational — do not enter closing formula)
{ $match: { week_id, type: 'price_diff_credit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }
{ $match: { week_id, type: 'price_diff_debit' } }, { $group: { _id: null, total: { $sum: '$amount' } } }
```

Map `channel`: `cash` → cash bucket; `upi` → bank bucket.

**Step 3 — Walk-in (`walkin_sales`):**

```javascript
{ $match: { week_id } },
{ $group: { _id: '$channel', total: { $sum: '$amount_collected' } } }
```

**Step 4 — Outstation farmer expenses (`farmer_payments`):**

```javascript
{ $match: { week_id } },
// Paid amounts by channel from amount_paid where status in ['partial','paid']
// outstanding_farmer_liabilities: sum(outstanding) where status in ['unpaid','partial']
```

**Step 5 — Local farmer expenses (`local_farmer_inbound`):** Sum recorded payment amounts by channel for the week (per operator payment records on each inbound row or linked payment document per implementation model).

**Step 6 — Outstanding customer dues:**

```javascript
{ $match: { week_id, type: 'customer_due' } },
{ $group: { _id: null, total: { $sum: '$amount' } } }
```

**Step 7 — Closing balance (PRD §10.3):**

```
closing_balance_cash =
  opening_balance_cash
  + preorder_receipts_cash
  + market_day_receipts_cash
  + walkin_receipts_cash
  - outstation_farmer_paid_cash
  - local_farmer_paid_cash

closing_balance_bank =
  opening_balance_bank
  + preorder_receipts_bank
  + market_day_receipts_bank
  + walkin_receipts_bank
  - outstation_farmer_paid_bank
  - local_farmer_paid_bank
```

Wallet adjustment credits/debits **do not** enter closing balance formula.

### Output document (`weekly_summaries`)

| Field | Source |
| --- | --- |
| `summary_id` | generated UUID |
| `week_id` | weekId |
| `opening_balance_cash` / `opening_balance_bank` | `market_weeks` |
| `preorder_receipts_cash` / `_bank` | `top_up` sums |
| `market_day_receipts_cash` / `_bank` | `balance_payment` sums |
| `walkin_receipts_cash` / `_bank` | `walkin_sales` sums |
| `wallet_adjustments_credits` | `price_diff_credit` sum |
| `wallet_adjustments_debits` | `price_diff_debit` sum |
| `outstation_farmer_paid_cash` / `_bank` | `farmer_payments` paid |
| `local_farmer_paid_cash` / `_bank` | local farmer payments |
| `outstanding_farmer_liabilities` | sum outstanding on outstation |
| `outstanding_customer_dues` | `customer_due` sum |
| `closing_balance_cash` / `_bank` | formula above |
| `generated_at`, `created_at`, `created_by` | server / operator UID |

**Next week:** Operator uses this week's closing balances as next week's opening balances when creating the following `market_weeks` record (manual carry-forward at week creation).

---

## Error Class Reference

| Class | HTTP | `code` | When |
| --- | --- | --- | --- |
| `AppError` | varies | varies | base |
| `WalletInsufficientError` | 422 | `WALLET_INSUFFICIENT` | atomic debit failed |
| `WalletValidationError` | 400 | `WALLET_VALIDATION` | invalid paise/params |
| `WalletDuplicateOperationError` | 409 | `WALLET_DUPLICATE_OPERATION` | idempotency conflict |
| `WalletTransactionNotFoundError` | 404 | `WALLET_TXN_NOT_FOUND` | reversal target missing |
| `WalletDuplicateReversalError` | 409 | `WALLET_DUPLICATE_REVERSAL` | already reversed |
| `CustomerNotFoundError` | 404 | `CUSTOMER_NOT_FOUND` | |
| `FarmerNotFoundError` | 404 | `FARMER_NOT_FOUND` | |
| `MarketWeekNotFoundError` | 404 | `MARKET_WEEK_NOT_FOUND` | |
| `MarketWeekStateMismatchError` | 409 | `MARKET_WEEK_STATE_MISMATCH` | CAS transition race |
| `ActionNotAllowedError` | 409 | `ACTION_NOT_PERMITTED_IN_STATE` | route state gate |
| `TransitionGateBlocked` | 409 | `TRANSITION_GATE_FAILED` | transition blockers |
| `InvalidStateTransitionError` | 409 | `INVALID_TRANSITION` | illegal edge |
| `DuplicateMessageError` | 409 | `DUPLICATE_MESSAGE` | intake already approved |
| `DuplicatePhoneError` | 409 | `DUPLICATE_PHONE` | registration |
| `OrderNotFoundError` | 404 | `ORDER_NOT_FOUND` | |

---

## Route → Semantic Action Map (implementation)

| Route | `PERMITTED_ACTIONS` key |
| --- | --- |
| `POST .../produce` | `add_produce_item` |
| `PATCH .../produce/:itemId` | `edit_produce_price` / `delete_produce_item` |
| `PATCH .../intake/:messageId` | `confirm_order` |
| `POST .../orders` | `create_order` |
| `PATCH .../orders/:orderId` | `edit_order` / `record_balance_payment` |
| `DELETE .../orders/:orderId` | `cancel_order` |
| `PATCH .../delivery/:assignmentId` | `set_farmer_assignments` / `record_delivered_qty` / `edit_delivered_qty` |
| `PATCH .../orders/:orderId/packed` | `pack_order` |
| `PATCH .../orders/:orderId/dispatched` | `dispatch_order` |
| `POST .../walkin` | `record_walkin_sale` |
| `POST .../localfarmer-inbound` | `record_local_farmer_inbound` |
| `POST .../reconciliation/:diffId/confirm` | `confirm_price_diff` |
| `PATCH .../farmerpayments/:paymentId` | `mark_outstation_farmer_payment` |
| `POST .../wallet/topup` | `wallet_top_up` |
| `GET .../summary` | `view_weekly_summary` |
| `POST/PATCH customers,farmers,catalogue` | `register_entity` |
| `GET .../wallet` | `view_wallet` |

`PATCH .../state` uses transition validators, not `isActionAllowed`.

---

*End of B7 — API Route Contracts*
