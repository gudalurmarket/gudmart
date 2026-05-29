# B2 Wallet Engine Specification

## 1) Purpose and Scope

This document defines the **authoritative behaviour** of the wallet subsystem for the B2C Farmer Marketplace backend.

The Wallet Engine is the **only** component permitted to create `wallet_transactions` documents and to update `customers.wallet_balance`. No route, batch job, or test helper may bypass it.

**Normative dependencies:**

- `specs/B1-database-schema.md` — fields for `wallet_transactions`, `customers`, and `customer_orders` (e.g. `wallet_debited`, `balance_due`, `balance_cleared`).
- Project `CLAUDE.md` — non-negotiable invariants (paise-only, no wallet writes outside the engine, immutability of ledger rows).

**Out of scope:** payment gateways, float arithmetic, and any direct MongoDB update to wallet fields outside the engine’s transactional procedures.

---

## 2) Core Principles

| Principle | Definition |
| --- | --- |
| **Ledger as source of truth** | `wallet_transactions` is the **authoritative** record of all monetary movement. The ledger is **append-only**; rows are never updated or deleted after insert. |
| **Balance is derived** | `customer.wallet_balance` (paise) is a **cache** of the result of applying the ledger in order. It must always equal the `running_balance` of the **latest** applicable transaction for that customer. |
| **No orphan balance change** | Every change to `wallet_balance` **must** occur in the same durable unit of work as the insert of the corresponding `wallet_transactions` row (or rows, when a business operation requires more than one leg — see Section 5.4 and 6). There is **no** `update` to `wallet_balance` without a new ledger line. |
| **Integer paise only** | All amounts are signed **integers** in **paise** (1 INR = 100 paise). No `float` / `double` in business logic, APIs, or stored documents for money. The only place displaying rupees is display-only formatting (e.g. `formatINR` on the client). |
| **Determinism** | Given the same sequence of valid operations and the same initial balance, the resulting balance and ledger are identical. No random, time-based, or non-reproducible balance logic. |
| **Zero floor (wallet)** | `customers.wallet_balance` and per-transaction `running_balance` are **never negative**. Liability that cannot be taken from the wallet is recorded as `customer_due` (see Section 6), not as a negative wallet. |

---

## 3) Document Model (Contract with B1)

### 3.1 `wallet_transactions` (required fields for every row)

The engine must supply every field required by B1, including:

| Field | Notes |
| --- | --- |
| `txn_id` | Unique logical id (e.g. UUID). Used for idempotency and external correlation. |
| `customer_id` | FK to `customers.customer_id`. |
| `week_id` | Sets `null` when no week context applies; otherwise `market_weeks.week_id`. |
| `type` | One of the enums in Section 4. |
| `amount` | **Non-negative integer** (paise). **Sign of economic effect** is **not** stored in `amount`; it is **defined by `type`** (see Section 4). |
| `channel` | `cash` \| `upi` \| `system` — B1 required. `system` for engine-internal or automated legs; `cash` / `upi` when an operator action implies a physical/settlement channel. |
| `reference_note` | Optional string; when the operation links to an order, line, or reversal, the note must unambiguously identify that link (e.g. `order_id`, `line_item_id`, `original_txn_id`). |
| `running_balance` | **Non-negative integer** (paise): wallet balance **immediately after** this transaction is applied, **for wallet-valued effects** (see Section 4 for `customer_due`). |
| `created_at` | Server time at commit (monotonicity per customer is not guaranteed by the clock; **correctness** comes from `running_balance` and ordering rules in Section 5). |
| `created_by` | Firebase operator UID, or the literal `system` when the engine acts for automation. |

**Immutability:** After insert, **no** field of `wallet_transactions` may be updated or deleted. Corrections are **new** rows (typically `manual_adjustment` and/or a typed reversal as specified below).

### 3.2 `customers.wallet_balance`

- **Min:** `0` (integer paise).  
- **Update rule:** only via engine procedures that write a new `wallet_transactions` row in the same atomic operation.  
- **Invariant:** after any commit, `wallet_balance` **equals** the `running_balance` of the newest committed transaction for that customer that is part of the **wallet** history (all types except see Section 4.6 for `customer_due` handling of `running_balance`).

### 3.3 Order documents (`customer_orders`)

Relevant fields for integration (B1): `order_value`, `wallet_debited`, `balance_due`, `balance_cleared`, `status`. The engine **does not** own the order collection’s lifecycle but **specifies** how values must stay consistent with the ledger (Section 5).

---

## 4) Transaction Types — Semantics, Effect on Balance, Rules

**Convention — `amount` field:** always **≥ 0** (integer paise). **“Increases balance”** means add `amount` to the wallet; **“decreases balance”** means subtract `amount` from the wallet. Each type is either a **credit to wallet**, **debit from wallet**, or a **non-wallet ledger** row (`customer_due`).

### 4.1 `top_up`

| Aspect | Rule |
| --- | --- |
| **When created** | Operator records a **manual** wallet credit: cash, UPI, or other **confirmed** inflow, in any week state that permits wallet top-up per the state machine (see B2 state machine spec / CLAUDE gate table). |
| **Effect on balance** | **Increases** `wallet_balance` by `amount`. |
| **running_balance** | `previous_running_balance + amount`. |
| **channel** | `cash` or `upi` (operator-selected). Not `system`. |
| **Validation** | `amount` ≥ **minimum** top-up in paise (product rule: e.g. > 0; exact minimum to be fixed in app config or constants). `customer_id` must exist and be active. |
| **Constraints** | Idempotency: duplicate `txn_id` must not create a second credit (Section 7). |

---

### 4.2 `order_debit`

| Aspect | Rule |
| --- | --- |
| **When created** | **Order confirmation** when the customer’s order is confirmed and the **full** or **agreed** order value is debited from the wallet in one shot (MVP: typically full `order_value` at confirmation; see Section 5 for partial-confirmation rules if ever allowed). |
| **Effect on balance** | **Decreases** `wallet_balance` by `amount`. |
| **running_balance** | `previous_running_balance - amount`. |
| **channel** | `system`. |
| **reference_note** | Must include `order_id` (and `week_id` is also on the row). |
| **Validation** | `amount` > 0. **Precondition:** `previous_running_balance >= amount` (else reject — Section 8). **Atomic:** use a single **conditional** update: debit only if `wallet_balance >= amount` to avoid read-then-write races. |
| **Constraints** | **At most one** successful `order_debit` per `order_id` unless business rules explicitly allow amend flows (MVP: one debit per confirmation; order edits use reversal + new debit, or separate engine methods — see `reverse` below). `created_by` = operator who confirmed. |

---

### 4.3 `order_debit_reversal`

| Aspect | Rule |
| --- | --- |
| **When created** | An **annulment** of a previous `order_debit`: order cancelled, or confirmation corrected, where the system must **restore** the cash value that was debited. |
| **Effect on balance** | **Increases** `wallet_balance` by `amount` (equals the magnitude of the original debit being reversed, unless a partial reversal is explicitly specified — **MVP: full reversal of a single `order_debit` only**). |
| **running_balance** | `previous_running_balance + amount`. |
| **channel** | `system`. |
| **reference_note** | Must name the **original** `txn_id` and `order_id`. |
| **Validation** | `amount` > 0. The referenced original must exist, type `order_debit`, and must not already be fully reversed (detect via ledger rules: either disallow duplicate reversals, or idempotency key — Section 7). |
| **Constraints** | Engine does **not** delete or edit the original `order_debit` row. This row is the accounting correction. |

---

### 4.4 `price_diff_credit`

| Aspect | Rule |
| --- | --- |
| **When created** | After delivery, **reconciliation** calculates that the customer was **overcharged** relative to what they received (e.g. lower delivered qty than paid for in the week’s model): the wallet must be **credited** the difference. |
| **Effect on balance** | **Increases** `wallet_balance` by `amount`. |
| **running_balance** | `previous_running_balance + amount`. |
| **channel** | `system`. |
| **reference_note** | `order_id` + `line_item_id` (or equivalent) for the line whose price difference is settled. |
| **Validation** | `amount` > 0. Line must be in a state that allows this operation (e.g. `difference_confirmed` flow per B2 / PRD). |

---

### 4.5 `price_diff_debit`

| Aspect | Rule |
| --- | --- |
| **When created** | After delivery, the customer **received more** (or a higher value) than they prepaid for, so the wallet must be **debited** the additional charge. If the full debit cannot be taken from the wallet, the **overdelivery two-step** applies (Section 5.4). |
| **Effect on balance** | **Decreases** `wallet_balance` by up to `amount` (in the simple case, **exactly** `amount` when `previous_running_balance >= amount`). |
| **running_balance (simple case)** | `previous_running_balance - amount`. |
| **channel** | `system`. |
| **reference_note** | `order_id` + `line_item_id`. |
| **Validation** | `amount` > 0. **If** `previous_running_balance >= amount`: one row, one atomic debit. **If** `previous_running_balance < amount`: do **not** use a single row with a negative `running_balance` — use Section 5.4. |

---

### 4.6 `customer_due`

| Aspect | Rule |
| --- | --- |
| **When created** | In the **overdelivery** path: `price_diff_debit` **exceeds** current `wallet_balance`. The engine first debits the wallet to **zero**; the **residual** obligation is recorded as a `customer_due` **ledger row**. |
| **Effect on “wallet” balance** | This row does **not** take additional funds from the wallet; wallet is already at **0** when this is written. **Economic meaning:** the customer owes the marketplace **amount** (paise) *outside* the wallet. |
| **running_balance** | **Must be `0`**, because the **wallet** is empty after the companion debit. The **due** is the `amount` field on this `customer_due` document. |
| **channel** | `system`. |
| **reference_note** | `order_id`, `line_item_id`, and pointer to the related `price_diff_debit` or composite operation id. |
| **Validation** | `amount` > 0. Must be paired (in the same session) with the **partial** `price_diff_debit` that brings the balance to zero (Section 5.4). |
| **Constraints** | **Dues are not negative balances** — they are positive **receivables** on the ledger. |

---

### 4.7 `balance_payment`

| Aspect | Rule |
| --- | --- |
| **When created** | On **market day** (or as permitted by the state machine), the customer **pays the outstanding** order balance in cash or UPI. Operator records a payment that **credits the wallet** and **then** the order can be treated as `balance_cleared` in the same business flow (order module updates flags per Section 5.3). |
| **Effect on balance** | **Increases** `wallet_balance` by `amount`. |
| **running_balance** | `previous_running_balance + amount`. |
| **channel** | `cash` or `upi` (how the customer paid the operator). |
| **reference_note** | `order_id`; optional receipt note. |
| **Validation** | `amount` > 0. Typically `amount` equals the remaining **outstanding** for that order (`balance_due` in order terms) unless partial payments are explicitly allowed. |

---

### 4.8 `manual_adjustment`

| Aspect | Rule |
| --- | --- |
| **When created** | **Corrective** or **exception** movement not covered by a typed business event: e.g. accounting fix, write-off, goodwill credit, with operator accountability. |
| **Effect on balance** | **Either** **credit** (increases) **or** **debit** (decreases) — the engine’s API must use an explicit **direction** parameter and must emit one row with the correct type semantics. **Implementation contract:** the row still uses the same `type` = `manual_adjustment`; the **sign** of the effect on the wallet is defined by the engine’s `direction` + rules below. |
| **running_balance** | `previous + amount` (credit) or `previous - amount` (debit). |
| **channel** | Usually `system`; or `upi`/`cash` if policy maps adjustments to a channel. |
| **reference_note** | **Mandatory** human-readable **reason** (and ticket id if any). |
| **Validation** | `amount` > 0. **Debit** direction: `previous_running_balance >= amount` or reject (no negative wallet). |
| **Constraints** | **Not** used to “fix” a mistaken row by **editing** — only by **appending** a new adjustment. |

---

## 5) Requirements — Functional Rules

### 5.1 Transaction creation rules (global)

1. **Every** change to `customers.wallet_balance` **must** insert **exactly one** new `wallet_transactions` document in the same atomic update as the balance field **except** the **two-step** overdelivery case, which inserts **two** documents in one **MongoDB session** (see 5.4).  
2. **Transactions are immutable** after commit — no `update` / `delete`.  
3. **Each** transaction must include: `customer_id`, `type`, `amount` (non-negative), `running_balance`, `created_at`, `created_by`, plus B1’s other required fields (`txn_id`, `channel`, `week_id` as applicable).  
4. **Atomicity for multi-step wallet operations** must use a **client session** with **transaction** (or an equivalent **single** `findOneAndUpdate` when a single leg suffices) per engine API. When two rows are required, they commit **together** or **neither** is visible.

### 5.2 Balance computation rules

1. **Definition — `previous_running_balance`:** the `running_balance` of the **immediately previous** committed transaction for that `customer_id` when ordered by a **total order** the engine defines for replay. **Implementation standard:** `created_at` ascending, tie-broken by **insertion order** or a monotonic sequence if added — but **in practice** the engine must **never** depend on a blind read: it must read the **current** `wallet_balance` (which must equal the last `running_balance`) as the `previous` value **inside** the same atomic operation.  
2. **Formula — after any credit-type row:** `running_balance = previous_wallet_balance + amount`.  
3. **Formula — after any debit-type row (that debits the wallet):** `running_balance = previous_wallet_balance - amount`.  
4. **`customer_due` row:** `running_balance = 0` and **no further subtraction** is applied to the wallet.  
5. **Invariant:** `customers.wallet_balance` after commit = `running_balance` of the last inserted row in that commit for the customer.  
6. **Negative balance prevention:** the engine **rejects** any operation that would compute `running_balance < 0` for **wallet**; excess obligation becomes `customer_due` (5.4).

### 5.3 Order integration

| Topic | Spec |
| --- | --- |
| **At confirmation** | If the order is confirmed with **prepaid wallet** for the full `order_value`, the engine runs **`debitForOrder`**: one `order_debit` with `amount = order_value` (paise), **if** `wallet_balance >= order_value`. **Simultaneously**, the order layer sets `wallet_debited = order_value` and `balance_due = 0` (or leaves `balance_due` for a defined partial model). |
| **Insufficient balance at confirmation** | The engine **refuses** `debitForOrder` (error: insufficient funds). The order must **not** be confirmed with that debit, or the product must use **pending** flow until top-up. **MVP default:** do not confirm without sufficient wallet. |
| **Partial prepayment / part wallet** (if allowed by product) | If business rules allow **part** from wallet and **rest** as `balance_due`, then: **(a)** `order_debit` for the **part** from wallet, **(b)** order stores `balance_due = order_value - wallet_part`, **(c)** `wallet_debited` reflects only what was actually debited. **If** product does not allow this, the engine only exposes “full debit or fail”. |
| **Cancellation** | `reverseOrderDebit` creates `order_debit_reversal` and order layer zeros `wallet_debited` and clears payment flags per lifecycle rules. |
| **Balance due at market day** | `balance_due` on the order is **metadata**; **settlement** uses `balance_payment` to move money **into** the wallet, then order flows mark `balance_cleared` (or equivalent) — exact flag updates are **order module** responsibility but must **match** sum of `balance_payment` rows for that order. |

### 5.4 Price difference handling (delivery vs ordered)

1. **Compute line delta** in **integer paise** from business rules (FCFS, delivered qty, `price_per_unit`, rounding rules in FCFS spec — not duplicated here).  
2. **If customer is owed (credit):** insert **`price_diff_credit`** with `amount = delta` (paise), single atomic credit.  
3. **If customer owes (debit) and** `wallet_balance >= delta`:** one **`price_diff_debit`**, `running_balance = wallet_balance - delta`.  
4. **If customer owes and** `wallet_balance < delta`:** **Overdelivery two-step** (single MongoDB **session**):  
   - **Step A — partial debit to zero:** one **`price_diff_debit`** with `amount = wallet_balance` (i.e. drain wallet), `running_balance = 0`.  
   - **Step B — record remainder due:** one **`customer_due`** with `amount = delta - wallet_balance`, `running_balance = 0`.  
5. **Idempotency:** applying the same line’s price-diff twice must be **prevented** by order/line state (`difference_confirmed` or idempotency key — Section 7).

### 5.5 Customer due — record, clear, relationship to balance

| Question | Rule |
| --- | --- |
| **What is a due?** | A **liability of the customer to pay** a fixed paise **amount** stored as a `customer_due` row. It is **not** a negative `wallet_balance`. |
| **Relationship to `wallet_balance`** | **Independent** — clearing a “due” is not automatic. The customer may later **`balance_payment`**, **`top_up`**, or a **`manual_adjustment` credit**; business rules may allocate that credit to a specific `order_id` in the order document. The **ledger** always records the **flow**; allocation to **which** due is a **reconciliation** concern that must stay **deterministic** (e.g. operator ties payment to an order in UI → engine `reference_note` / order update). |
| **Clearing a due** | **Primarily** through **`balance_payment`** (cash/UPI) **or** **`top_up`** if policy treats it as the same as cash in hand, then a subsequent **`order_debit`** is **not** the typical path for “old due” — **MVP reading:** `balance_payment` is the type used when the operator records payment against an order with outstanding; **`manual_adjustment`** for write-off. A **`customer_due` row is not deleted** when “cleared”; a **separate** credit transaction represents the remittance, and the order’s fields (`balance_due`, `balance_cleared`) are updated by the order layer. |

### 5.6 Idempotency and safety (retries)

1. **Primary key — `txn_id`:** the engine **must** generate a **new** `txn_id` for each **new** attempt, **or** the caller may supply a **client idempotency key** that the engine maps to `txn_id`.  
2. **Duplicate insert of same `txn_id`:** **reject** the second (unique index on `txn_id`) and return a **defined** “already applied” result **without** double-counting.  
3. **Retries of `debitForOrder` / `topUp`:** safe if each retry uses a **new** `txn_id` and the first commit **won**; a retry after success must be recognized **by idempotency key** and must **not** debit again. **Preferred:** idempotency key in API body stored in a small **idempotency** store or encoded in `txn_id` (deterministic hash of `(customer_id, order_id, operation, nonce)`).  
4. **Concurrent debits (race):** use **atomic** `findOneAndUpdate` with condition `{ wallet_balance: { $gte: amount } }` so at most one concurrent debit succeeds.  
5. **Determinism:** no random `running_balance`; it is always computed from the **pre-update** read inside the same atomic operation or session.

### 5.7 Error handling — rejection conditions

| Condition | Result |
| --- | --- |
| Non-integer or negative `amount` where only positive integer allowed | Reject (validation). |
| `amount = 0` for types that require movement | Reject. |
| Debit would make `running_balance` negative | Reject with **insufficient balance**; **or** for `price_diff_debit` only, **route** to overdelivery two-step. |
| Unknown `customer_id` | Reject. |
| Duplicate `txn_id` | Idempotent no-op or “already exists” (no double effect). |
| `order_debit` when order already has a non-reversed `order_debit` | Reject (unless idempotent repeat of same request). |
| `order_debit_reversal` for non-existent or already fully reversed original | Reject. |
| `manual_adjustment` without **mandatory** `reference_note` | Reject. |
| State machine forbids the **calling action** (e.g. top-up in `closed` week) | Reject at route layer; engine may still validate week id presence when required. |
| **Floats** in any money field at API or engine boundary | Reject (schema / validation). |

**Engine-specific errors (normative names for implementers):**

- **`WalletInsufficientError`** — debit cannot proceed without two-step; thrown for `debitForOrder` / `applyPriceDiff` (simple) when `wallet_balance < required amount`.  
- **Validation / conflict** — invalid parameters, duplicate idempotency violation, or illegal transition.

---

## 6) Engine Public Operations (API-to-ledger mapping)

The implementation **must** expose a **small fixed surface** (names illustrative; method signatures in code):

1. **topUp** — creates `top_up`.  
2. **debitForOrder** — creates `order_debit` (and updates order only via the caller in sync).  
3. **reverseOrderDebit** — creates `order_debit_reversal`.  
4. **applyPriceDiff** — creates `price_diff_credit` or `price_diff_debit` or **session** of `price_diff_debit` + `customer_due`.  
5. **applyBalancePayment** — creates `balance_payment`.  
6. **manualAdjustment** — creates `manual_adjustment` (credit or debit by direction).  

**No** other module may call MongoDB to insert `wallet_transactions` or patch `wallet_balance`.

---

## 7) Constraints Checklist (non-functional)

- [ ] No `update` on `wallet_transactions` after insert.  
- [ ] No floating point for money.  
- [ ] All operations **deterministic** and **order-independent** of wall-clock **except** `created_at` (effect order defined by engine atomicity, not by timestamp comparison in clients).  
- [ ] Every committed transaction yields **`running_balance` ≥ 0** and consistent with `type`.  
- [ ] `customers.wallet_balance` matches last wallet-affecting row’s `running_balance` after every commit.  
- [ ] **Overdelivery** always uses a **session** (two rows or one conditional pattern that cannot partial-commit).  
- [ ] **Corrections** by **new** lines only, never in-place.

---

## 8) Traceability

| B2 spec | B1 / code anchor |
| --- | --- |
| Ledger fields | `server/models/WalletTransaction.js` |
| Order fields | `server/models/Customer.js`, `server/models/CustomerOrder.js` |
| Gate “when top-up / balance allowed” | `B2-state-machine.md` and CLAUDE Section 6 |

**End of document.**
