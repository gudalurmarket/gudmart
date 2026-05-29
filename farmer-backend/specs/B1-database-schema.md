# B1 Database Schema Specification (Mongoose)

This document is the authoritative schema specification for model implementation under `server/models/*.js`. It defines all fields, validation rules, embedding/reference decisions, immutability constraints, and index declarations for:

- 13 operational collections
- 1 `config` collection document (`_id: 'synonyms'`)

## Global Rules (Apply to All Models)

- Field naming: snake_case in persisted documents.
- Monetary fields: `type: Number, validate: { validator: Number.isInteger }` with annotation `// paise integer — no floats`.
- No monetary floats anywhere in schema or business data.
- Operator-action documents include:
  - `created_at: { type: Date, default: Date.now }`
  - `created_by: { type: String, required: true }` (Firebase UID)
- Immutability:
  - Every `wallet_transactions` field is immutable once inserted.
  - `customer_orders.line_items[*]` fields are immutable once written, except state-window fields explicitly documented (`delivered_qty`, `difference_confirmed`).
  - Additional immutable fields from lifecycle rules are marked in each section.
- Index policy for this spec:
  - Include every index mandated in project `CLAUDE.md` Section 15.
  - Do not add extra indexes beyond that mandated list.

---

## 1) farmers

- **Model file path:** `server/models/Farmer.js`
- **Collection name:** `farmers`
- **Embedding/reference:** standalone root collection.

### Fields

- `_id`: ObjectId (Mongo default)
- `farmer_id`: `String`, required, unique logical identifier (UUID string)
- `name`: `String`, required, trim
- `phone`: `String`, required, trim
- `location`: `String`, required, trim
- `farmer_type`: `String`, required, enum: `['outstation', 'local']`
- `active`: `Boolean`, default `true`
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ phone: 1 }` unique
- `{ farmer_type: 1, active: 1 }`

### Notes

- `phone` is WhatsApp match key and must remain unique.

---

## 2) customers

- **Model file path:** `server/models/Customer.js`
- **Collection name:** `customers`
- **Embedding/reference:** standalone root collection.

### Fields

- `_id`: ObjectId
- `customer_id`: `String`, required, unique logical identifier (UUID string)
- `name`: `String`, required, trim
- `phone`: `String`, required, trim
- `active`: `Boolean`, default `true`
- `wallet_balance`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ phone: 1 }` unique

### Notes

- `wallet_balance` is mutable only through WalletEngine operations.

---

## 3) product_catalogue

- **Model file path:** `server/models/ProductCatalogue.js`
- **Collection name:** `product_catalogue`
- **Embedding/reference:** standalone root collection used by week produce and order lines.

### Fields

- `_id`: ObjectId
- `product_id`: `String`, required, unique logical identifier (UUID string)
- `name_en`: `String`, required, trim
- `name_ta`: `String`, optional, trim
- `default_unit`: `String`, required, enum: `['kg', 'piece', 'bunch', '100g']`
- `active`: `Boolean`, default `true`
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- No additional explicit index in mandated index list.

### Notes

- Synonyms are not stored here; they live in `config` (`_id: 'synonyms'`).

---

## 4) market_weeks

- **Model file path:** `server/models/MarketWeek.js`
- **Collection name:** `market_weeks`
- **Embedding/reference:** standalone root collection; includes embedded `state_history`.

### Fields

- `_id`: ObjectId
- `week_id`: `String`, required, unique logical identifier (UUID string)
- `market_date`: `Date`, required
- `state`: `String`, required, enum:
  - `setup`
  - `open`
  - `locked`
  - `delivery`
  - `market_day`
  - `reconciliation`
  - `closed`
- `opening_balance_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats
- `opening_balance_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats
- `closed_at`: `Date`, default `null`
- `state_history`: `[subdocument]`, default `[]`, each entry:
  - `from_state`: `String`, required, enum same as `state`
  - `to_state`: `String`, required, enum same as `state`
  - `changed_at`: `Date`, required, default `Date.now`
  - `changed_by`: `String`, required (Firebase UID)
  - `note`: `String`, optional
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ market_date: 1 }` unique
- `{ state: 1 }`

### Notes

- `state` is mutable only through state transition validator route.

---

## 5) weekly_produce_items

- **Model file path:** `server/models/WeeklyProduceItem.js`
- **Collection name:** `weekly_produce_items`
- **Embedding/reference:** standalone; references `market_weeks` and `product_catalogue`.

### Fields

- `_id`: ObjectId
- `produce_item_id`: `String`, required, unique logical identifier (UUID string)
- `week_id`: `String`, required (FK logical reference to `market_weeks.week_id`)
- `product_id`: `String`, required (FK logical reference to `product_catalogue.product_id`)
- `unit`: `String`, required, enum: `['kg', 'piece', 'bunch', '100g']`
- `price_per_unit`: `Number`, required, validate `Number.isInteger` // paise integer — no floats
- `display_order`: `Number`, required, min `0`, validate `Number.isInteger`
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ week_id: 1, product_id: 1 }` unique
- `{ week_id: 1, display_order: 1 }`

---

## 6) customer_orders

- **Model file path:** `server/models/CustomerOrder.js`
- **Collection name:** `customer_orders`
- **Embedding/reference:** root order document with embedded `line_items[]` (not a separate collection).
- **Rationale:** line items are read/written with parent order; expected size safely below MongoDB 16MB limit.

### Fields

- `_id`: ObjectId
- `order_id`: `String`, required, unique logical identifier (UUID string)
- `week_id`: `String`, required (FK to `market_weeks.week_id`)
- `customer_id`: `String`, required (FK to `customers.customer_id`)
- `status`: `String`, required, enum:
  - `pending_payment`
  - `confirmed`
  - `cancelled`
  - `packed`
  - `dispatched`
  - `delivered`
- `fcfs_timestamp`: `Date`, required // immutable — never updated after write
- `order_value`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable at confirmation point
- `wallet_debited`: `Number`, required, default `0`, validate `Number.isInteger` // paise integer — no floats; immutable after confirmation
- `balance_due`: `Number`, required, default `0`, validate `Number.isInteger` // paise integer — no floats
- `balance_cleared`: `Boolean`, required, default `false`
- `notes`: `String`, optional
- `line_items`: `[subdocument]`, required, min length 1

#### Embedded `line_items[]` subdocument fields

- `line_item_id`: `String`, required // immutable — never updated after write
- `product_id`: `String`, required // immutable — never updated after write
- `ordered_qty`: `Number`, required, min `0` // immutable — never updated after write
- `delivered_qty`: `Number`, required, min `0` (mutable only in delivery/reconciliation windows)
- `unit`: `String`, required, enum `['kg', 'piece', 'bunch', '100g']` // immutable — never updated after write
- `price_per_unit`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `line_value`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `difference_confirmed`: `Boolean`, required, default `false` (mutable only in reconciliation)

- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ week_id: 1, status: 1, fcfs_timestamp: 1 }`
- `{ week_id: 1, customer_id: 1 }`
- `{ week_id: 1, status: 1 }`

---

## 7) wallet_transactions

- **Model file path:** `server/models/WalletTransaction.js`
- **Collection name:** `wallet_transactions`
- **Embedding/reference:** standalone immutable ledger collection.

### Fields

- `_id`: ObjectId
- `txn_id`: `String`, required, unique logical identifier (UUID string) // immutable — never updated after write
- `customer_id`: `String`, required (FK to `customers.customer_id`) // immutable — never updated after write
- `week_id`: `String`, nullable (FK to `market_weeks.week_id`) // immutable — never updated after write
- `type`: `String`, required, enum:
  - `top_up`
  - `order_debit`
  - `order_debit_reversal`
  - `price_diff_credit`
  - `price_diff_debit`
  - `customer_due`
  - `balance_payment`
  - `manual_adjustment`
  // immutable — never updated after write
- `amount`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `channel`: `String`, required, enum `['cash', 'upi', 'system']` // immutable — never updated after write
- `reference_note`: `String`, optional // immutable — never updated after write
- `running_balance`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `created_at`: `Date`, default `Date.now` // immutable — never updated after write
- `created_by`: `String`, required (Firebase UID or `system`) // immutable — never updated after write

### Indexes (explicit)

- `{ customer_id: 1, created_at: -1 }`
- `{ week_id: 1, type: 1 }`
- `{ customer_id: 1, week_id: 1 }`

---

## 8) inbound_messages

- **Model file path:** `server/models/InboundMessage.js`
- **Collection name:** `inbound_messages`
- **Embedding/reference:** standalone intake queue collection; parser output embedded in `parsed_items[]`.

### Fields

- `_id`: ObjectId
- `message_id`: `String`, required // immutable — never updated after write
- `week_id`: `String`, nullable (FK to `market_weeks.week_id`)
- `sender_phone`: `String`, required // immutable — never updated after write
- `customer_id`: `String`, nullable (FK to `customers.customer_id`)
- `body`: `String`, nullable for non-text media // immutable — never updated after write
- `media_type`: `String`, required, enum `['text', 'audio', 'image', 'other']`
- `fcfs_timestamp`: `Date`, required // immutable — never updated after write
- `parse_status`: `String`, required, enum:
  - `clean`
  - `partial`
  - `manual_required`
  - `voice_note`
  - `image`
  - `no_active_week`
- `parsed_items`: `[subdocument]`, default `[]` // immutable — never updated after write
  - `raw_text`: `String`, required
  - `product_id`: `String`, nullable
  - `raw_product_text`: `String`, nullable
  - `quantity`: `Number`, nullable
  - `unit`: `String`, nullable, enum `['kg', 'piece', 'bunch', '100g']`
  - `confidence`: `String`, required, enum `['clean', 'partial', 'manual_required']`
- `queue_status`: `String`, required, default `pending`, enum `['pending', 'approved', 'rejected']`
- `operator_notes`: `String`, optional
- `processed_at`: `Date`, default `null`
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required, default `system` (webhook pipeline actor)

### Indexes (explicit)

- `{ message_id: 1 }` unique
- `{ week_id: 1, queue_status: 1, fcfs_timestamp: 1 }`

---

## 9) farmer_order_assignments

- **Model file path:** `server/models/FarmerOrderAssignment.js`
- **Collection name:** `farmer_order_assignments`
- **Embedding/reference:** standalone assignment collection keyed by week + farmer + product.

### Fields

- `_id`: ObjectId
- `assignment_id`: `String`, required, unique logical identifier (UUID string)
- `week_id`: `String`, required (FK to `market_weeks.week_id`)
- `farmer_id`: `String`, required (FK to `farmers.farmer_id`, outstation expected)
- `product_id`: `String`, required (FK to `product_catalogue.product_id`)
- `preorder_qty`: `Number`, required, min `0`
- `buffer_pct`: `Number`, required, min `0`
- `buffer_qty`: `Number`, required, min `0`
- `outgoing_qty`: `Number`, required, min `0`
- `delivered_qty`: `Number`, required, min `0` (mutable only in delivery state window)
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ week_id: 1, farmer_id: 1, product_id: 1 }` unique

---

## 10) local_farmer_inbound

- **Model file path:** `server/models/LocalFarmerInbound.js`
- **Collection name:** `local_farmer_inbound`
- **Embedding/reference:** standalone collection for local market-day inbound items.

### Fields

- `_id`: ObjectId
- `inbound_id`: `String`, required, unique logical identifier (UUID string)
- `week_id`: `String`, required (FK to `market_weeks.week_id`)
- `farmer_id`: `String`, required (FK to `farmers.farmer_id`, local expected)
- `product_id`: `String`, nullable (FK to `product_catalogue.product_id`)
- `item_name`: `String`, required when `product_id` is null
- `inbound_qty`: `Number`, required, min `0`
- `sold_qty`: `Number`, required, default `0`, min `0`
- `unit`: `String`, required, enum `['kg', 'piece', 'bunch', '100g']`
- `price_per_unit`: `Number`, required, validate `Number.isInteger` // paise integer — no floats
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- No additional explicit index in mandated index list.

---

## 11) walkin_sales

- **Model file path:** `server/models/WalkInSale.js`
- **Collection name:** `walkin_sales`
- **Embedding/reference:** standalone immutable sales ledger for market-day transactions.

### Fields

- `_id`: ObjectId
- `sale_id`: `String`, required, unique logical identifier (UUID string) // immutable — never updated after write
- `week_id`: `String`, required (FK to `market_weeks.week_id`) // immutable — never updated after write
- `product_id`: `String`, nullable (FK to `product_catalogue.product_id`) // immutable — never updated after write
- `inventory_source`: `String`, required, enum `['outstation', 'local_farmer']` // immutable — never updated after write
- `farmer_id`: `String`, nullable (FK to `farmers.farmer_id`) // immutable — never updated after write
- `qty_sold`: `Number`, required, min `0` // immutable — never updated after write
- `amount_collected`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `channel`: `String`, required, enum `['cash', 'upi']` // immutable — never updated after write
- `customer_id`: `String`, nullable (FK to `customers.customer_id`) // immutable — never updated after write
- `loose_customer_name`: `String`, nullable // immutable — never updated after write
- `loose_customer_phone`: `String`, nullable // immutable — never updated after write
- `created_at`: `Date`, default `Date.now` // immutable — never updated after write
- `created_by`: `String`, required (Firebase UID) // immutable — never updated after write

### Indexes (explicit)

- No additional explicit index in mandated index list.

---

## 12) farmer_payments

- **Model file path:** `server/models/FarmerPayment.js`
- **Collection name:** `farmer_payments`
- **Embedding/reference:** standalone payment settlement collection (one record per farmer per week).

### Fields

- `_id`: ObjectId
- `payment_id`: `String`, required, unique logical identifier (UUID string)
- `week_id`: `String`, required (FK to `market_weeks.week_id`)
- `farmer_id`: `String`, required (FK to `farmers.farmer_id`, outstation for this model)
- `amount_due`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats
- `status`: `String`, required, enum `['unpaid', 'partial', 'paid']`
- `amount_paid`: `Number`, required, default `0`, min `0`, validate `Number.isInteger` // paise integer — no floats
- `outstanding`: `Number`, required, min `0`, validate `Number.isInteger` // paise integer — no floats
- `channel`: `String`, nullable, enum `['cash', 'upi']`
- `recorded_at`: `Date`, required, default `Date.now`
- `created_at`: `Date`, default `Date.now`
- `created_by`: `String`, required (Firebase UID)

### Indexes (explicit)

- `{ week_id: 1, farmer_id: 1 }` unique
- `{ farmer_id: 1, status: 1 }`

---

## 13) weekly_summaries

- **Model file path:** `server/models/WeeklySummary.js`
- **Collection name:** `weekly_summaries`
- **Embedding/reference:** standalone write-once weekly closure snapshot.

### Fields

- `_id`: ObjectId
- `summary_id`: `String`, required, unique logical identifier (UUID string) // immutable — never updated after write
- `week_id`: `String`, required (FK to `market_weeks.week_id`) // immutable — never updated after write
- `opening_balance_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `opening_balance_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `preorder_receipts_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `preorder_receipts_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `market_day_receipts_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `market_day_receipts_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `walkin_receipts_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `walkin_receipts_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `wallet_adjustments_credits`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `wallet_adjustments_debits`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `outstation_farmer_paid_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `outstation_farmer_paid_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `local_farmer_paid_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `local_farmer_paid_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `outstanding_farmer_liabilities`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `outstanding_customer_dues`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `closing_balance_cash`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `closing_balance_bank`: `Number`, required, validate `Number.isInteger` // paise integer — no floats; immutable — never updated after write
- `generated_at`: `Date`, required, default `Date.now` // immutable — never updated after write
- `created_at`: `Date`, default `Date.now` // immutable — never updated after write
- `created_by`: `String`, required (Firebase UID or `system`) // immutable — never updated after write

### Indexes (explicit)

- No additional explicit index in mandated index list.

---

## 14) config (synonyms document)

- **Model file path:** `server/models/Config.js`
- **Collection name:** `config`
- **Document shape (fixed):** `{ _id: 'synonyms', table: [...] }`
- **Embedding/reference:** standalone single-document collection for parser configuration.

### Fields

- `_id`: `String`, required, fixed enum `['synonyms']`
- `table`: `[subdocument]`, required, default `[]`, each entry:
  - `canonical`: `String`, required (canonical product token)
  - `aliases`: `[String]`, required, default `[]`
  - `language`: `String`, optional, enum `['en', 'ta', 'mixed']`
- `updated_at`: `Date`, default `Date.now`
- `updated_by`: `String`, required (Firebase UID or `system`)

### Indexes (explicit)

- No additional explicit index in mandated index list.

### Notes

- This is configuration data, not an operational transactional collection.
- Loaded at server startup and cached in memory for parser lookup.

---

## Collection-to-Model Path Summary

| # | Collection / Document | Model File Path |
|---|---|---|
| 1 | farmers | `server/models/Farmer.js` |
| 2 | customers | `server/models/Customer.js` |
| 3 | product_catalogue | `server/models/ProductCatalogue.js` |
| 4 | market_weeks | `server/models/MarketWeek.js` |
| 5 | weekly_produce_items | `server/models/WeeklyProduceItem.js` |
| 6 | customer_orders | `server/models/CustomerOrder.js` |
| 7 | wallet_transactions | `server/models/WalletTransaction.js` |
| 8 | inbound_messages | `server/models/InboundMessage.js` |
| 9 | farmer_order_assignments | `server/models/FarmerOrderAssignment.js` |
| 10 | local_farmer_inbound | `server/models/LocalFarmerInbound.js` |
| 11 | walkin_sales | `server/models/WalkInSale.js` |
| 12 | farmer_payments | `server/models/FarmerPayment.js` |
| 13 | weekly_summaries | `server/models/WeeklySummary.js` |
| 14 | config (`_id: 'synonyms'`) | `server/models/Config.js` |
