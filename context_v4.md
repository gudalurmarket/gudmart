# B2C Farmer Marketplace – Context Document

**Version:** 4.0
**Status:** Final – Single Reference Document for PRD
**Supersedes:** context_v3.md
**Last Updated:** April 2026

---

## 1. Background

A community-driven organic market operates weekly in the Gudalur–Ooty region. Approximately 15 outstation farmers supply fresh organic produce. Approximately 50 registered customers pre-order weekly. The market also serves walk-in buyers on market day, including both anonymous buyers and loosely registered buyers whose name and phone are optionally recorded.

The current system is entirely manual — farmers communicate availability via WhatsApp, the operator consolidates orders in Excel, customers place orders via WhatsApp messages, and payments are tracked informally via UPI screenshots and cash. This is functional at current scale but is not sustainable as the community grows.

The goal is to digitise the high-effort operator workflows while preserving the WhatsApp-based communication habits of farmers and customers, who are predominantly 45+ years of age with low technical familiarity and approximately 30–40% low literacy.

---

## 2. Guiding Principle

> **Automate high-impact operator actions. Preserve low-impact manual habits.**

The operator bears the highest operational burden today. All automation is directed at reducing operator effort. Customer and farmer interactions via WhatsApp are not disrupted in MVP. The system is built around the operator, not the end user.

---

## 3. Actors

### 3.1 Operator

- 1 to 3 persons; full system access via PWA dashboard on laptop or tablet
- Responsible for all data entry, state transitions, payment confirmations, and reconciliation
- The single point of control for all critical system actions
- Comfortable using a web-based dashboard

### 3.2 Registered Customer

- Approximately 50 customers
- 45+ years of age; WhatsApp-native; low technical familiarity
- Places orders via WhatsApp message to operator — unchanged in MVP
- Maintains a pre-loaded wallet in the system; wallet balance must be positive before an order is confirmed
- Pays advance via UPI or cash; operator confirms payment in system
- Collects order at market on market day; pays any balance due at pickup — balance payment is outside the system, confirmed by operator
- Can query order status, wallet balance, and pending payments — channel to be decided (see Section 11, Open Decision 2)

### 3.3 Walk-in Customer

Walk-in customers have three states. Wallet and pre-order logic apply only to fully registered customers.

| State | Description | What the System Records |
|---|---|---|
| **Anonymous** | No registration | Nothing — no record kept |
| **Loosely registered** | Operator optionally captures name and phone at point of sale | Name, phone, sale record only — no wallet, no pre-order |
| **Fully registered** | Same as Registered Customer (Section 3.2) | Full profile with wallet |

Conversion from loosely registered to fully registered is possible but is not a designed flow in MVP. If the operator wishes to fully register a loosely registered walk-in customer, this is handled as a fresh registration.

### 3.4 Outstation Farmer

- Approximately 15 outstation farmers
- Registered once by operator: name, phone number, location
- No system access in MVP
- Sends weekly availability list to operator via WhatsApp — unchanged
- Receives consolidated order from operator via WhatsApp — outside the system
- Payment due tracked in system; operator marks payment status (paid / partial / unpaid)

### 3.5 Local Farmer

- Approximately 5–10 local farmers
- Registered once by operator: name, phone number, location
- No system access in MVP
- Brings produce to market on market day; operator records inbound items and quantity
- Items are tracked separately per local farmer for payment attribution — not merged with outstation inventory
- If a local farmer and an outstation farmer supply the same item, they are treated as separate physical stock; payment attribution to the correct farmer is handled manually by the operator
- Operator pays local farmer at end of market day based on items sold; unsold produce is taken back by the local farmer
- Items sold to both registered customers and walk-in customers are tracked in system; operator records payment mode and amount

### 3.6 Volunteer

- Handles packing and distribution on market day
- Access via mobile-friendly PWA
- Permitted actions: view packing list, mark orders as packed, mark orders as dispatched
- If a delivery shortfall occurs from outstation farmers, FCFS (first come, first served) rule applies — the customer who placed their order earliest gets priority; this governs packing list sort order

---

## 4. Solution Architecture

### 4.1 Core Direction

The system is an **operator-first PWA dashboard**. All primary screens and workflows are designed for the operator. WhatsApp remains the communication layer for customers and farmers — it is not replaced.

The operator uses the PWA to:

- Manage outstation farmer, local farmer, registered customer, and walk-in customer registrations
- Enter and publish the weekly produce list from outstation farmer WhatsApp messages
- Record registered customer orders entered from WhatsApp messages received
- Track and confirm payments and wallet top-ups
- Aggregate orders and set outstation farmer-level buffers
- Generate consolidated outstation farmer-specific order views
- Record delivery confirmation quantities from volunteers
- Manage packing and dispatch
- Record local farmer inbound items and sales
- Record walk-in sales
- Reconcile price differences and wallet adjustments
- Mark outstation and local farmer payments
- Close the week and generate the weekly financial summary

### 4.2 Customer Order Intake — Open Decision

See Section 11, Open Decision 1. Option A (manual WhatsApp → operator entry) is the confirmed MVP fallback.

### 4.3 Outstation Farmer Interaction

Fully manual in MVP. Operator enters the weekly produce list from WhatsApp messages. A farmer-facing interface is deferred to post-MVP.

### 4.4 Local Farmer Records

Registered once. On market day, operator records inbound items and quantities. At end of market day, operator pays local farmers for items sold and records payment in system. Local farmers take back unsold produce.

### 4.5 Volunteer Access

Mobile-friendly PWA view. Scoped to: view packing list, confirm actual delivered quantities on produce arrival, mark orders as packed, mark orders as dispatched.

---

## 5. Pricing Model

One price per item per week applies across all channels and all farmers. The operator enters item prices once when building the weekly produce list. The same price applies to:

- Registered customer pre-orders
- Walk-in sales against outstation inventory
- Walk-in sales against local farmer inventory
- Local farmer payment calculations (items sold × agreed weekly price)

There is no market-day price negotiation and no separate local farmer price list.

---

## 6. Current Workflow (As-Is)

```
Friday
Outstation farmers send weekly produce availability to operator via WhatsApp
        |
Operator consolidates produce list manually in Excel
        |
Operator shares produce list with registered customers via WhatsApp group
        |
Registered customers send individual orders to operator via WhatsApp
        |
Operator manually records orders in Excel
        |
Registered customers make advance payment via UPI (screenshot sent) or cash
        |
Operator verifies payment manually
        |
Operator aggregates all orders; manually adds 10–30% buffer per outstation farmer-item
Operator manually splits aggregated orders across individual outstation farmers
        |
Monday
Operator sends consolidated orders to each outstation farmer via WhatsApp
        |
Wednesday
Produce arrives at Gudalur
        |
Volunteers pack registered customer-specific orders manually
        |
Market Day
Local farmers bring produce; operator records items
Registered customers collect orders; pay any balance due in cash or UPI
Operator records walk-in sales separately
        |
Operator reconciles price differences, payments, outstation farmer dues
Local farmers get paid based on their sales; take back unsold produce
        |
Operator updates Excel summary; closes the week manually
```

---

## 7. Target Workflow (To-Be)

```
Friday
Operator enters weekly produce list into PWA (from outstation farmer WhatsApp messages)
Operator sets item prices (single price per item applies to all channels)
Operator publishes week — system moves to Open for Orders state
        |
Operator shares produce list with registered customers via WhatsApp (unchanged)
        |
[Option A — MVP] Registered customers send orders to operator via WhatsApp
Operator enters customer orders into PWA
[Option B — Post-MVP] Customers interact with WhatsApp bot; orders auto-enter system
        |
Operator records advance payment per customer (cash or UPI)
System validates wallet balance; flags insufficient balance
Operator confirms wallet top-up in system
        |
Operator locks orders — system moves to Orders Locked state
Operator sets buffer per outstation farmer-item in PWA
System generates consolidated outstation farmer-specific order view
Operator sends orders to outstation farmers via WhatsApp (outside system)
        |
Wednesday
Produce arrives
Volunteers open PWA; confirm actual delivered quantities per item
System records shortfalls and overdelivery — input to reconciliation
Volunteers mark each order as packed (FCFS order applies if shortfall)
        |
Market Day
Volunteers mark orders as dispatched on registered customer pickup
Local farmers bring produce to market
Operator records inbound items and quantities from each local farmer
Operator records walk-in sales in PWA (against outstation or local farmer inventory)
        |
Operator opens Reconciliation in PWA
System flags price differences (ordered vs. delivered quantity or weight)
Operator confirms each difference; system applies wallet debit or credit
Operator marks outstation farmer payments (paid / partial / unpaid) and channel
Operator pays local farmers manually; marks payment in system
        |
Operator closes week — system generates weekly financial summary
Week state moves to Closed; no further edits permitted
```

---

## 8. Market Week Lifecycle

The system is organised around a weekly cycle. Each week has a defined state. System actions are gated by the current state.

| State | Initiated By | Key Actions Permitted |
|---|---|---|
| **1. Setup** | Operator creates new week | Enter produce list, set prices, set unit types |
| **2. Open for Orders** | Operator publishes week | Enter customer orders, record advance payments, validate wallet |
| **3. Orders Locked** | Operator locks orders | Set buffer, view consolidated outstation farmer orders |
| **4. Delivery** | Operator confirms produce arrived | Volunteers confirm delivered quantities, view packing list, mark orders packed |
| **5. Market Day** | Operator opens market day | Mark orders dispatched, record local farmer inbound, record walk-in sales |
| **6. Reconciliation** | Operator opens reconciliation | Confirm price differences, apply wallet adjustments, mark farmer payments |
| **7. Closed** | Operator closes week | Weekly summary available; read-only; no further edits |

---

## 9. Operator PWA — Screen Areas

### 9.1 Admin — Farmer Management

- Register new farmer: name, phone number, type (outstation or local), location
- Edit farmer details
- Deactivate farmer
- View farmer list

### 9.2 Admin — Customer Management

- Register new customer: name, phone number
- Edit customer details
- Deactivate customer
- View customer list with wallet balance

### 9.3 Weekly Produce List Management

- Create new market week
- Add items to produce list: item name, unit type (weight-based kg or count-based piece/bunch/100g), price
- Edit or remove items
- Publish week (moves to Open for Orders state)

### 9.4 Order Management

- View registered customer list
- Enter customer order: select customer, select items, enter quantities
- Record advance payment per customer: amount, channel (cash or UPI)
- Flag orders with insufficient wallet balance
- View aggregated order summary per item
- Lock orders (moves to Orders Locked state)

### 9.5 Outstation Farmer Order Management

- Add buffer quantity per outstation farmer-item (manual entry, 10–30%)
- View consolidated outstation farmer-specific order (items and quantities including buffer)
- Operator manually decides how to split aggregated orders across multiple outstation farmers supplying the same item
- Export or print outstation farmer order summary for WhatsApp sharing

### 9.6 Packing and Dispatch (Volunteer View)

- Confirm actual delivered quantities per item on produce arrival (records shortfalls and overdelivery)
- View customer-specific packing list for the week (sorted by FCFS order when shortfall applies)
- Mark individual orders as packed
- Mark individual orders as dispatched

### 9.7 Local Farmer Management

- View registered local farmers list
- Register new local farmer: name, phone number, location
- Record inbound items and quantities on market day
- View items sold vs. items brought
- Record payment made to local farmer; mark as paid and channel (cash or UPI)

### 9.8 Walk-in Sales

- Select item from current week's produce list (outstation or local farmer inventory)
- Optionally record walk-in customer name and phone number
- Enter quantity sold, amount collected, payment channel (cash or UPI)
- System records against week inventory and financial summary

### 9.9 Reconciliation

- View list of orders with price differences flagged by system (delivered qty vs. ordered qty)
- Confirm or adjust each difference
- System applies wallet debit (customer owes more) or wallet credit (customer overpaid)
- Mark outstation farmer payment status: unpaid / partial (enter amount) / paid
- Record payment channel for outstation farmer payment (cash or UPI)
- Record local farmer payment and mark as paid

### 9.10 Weekly Financial Summary

- Per-week summary: preorder receipts, market day receipts, outstation farmer expenses, local farmer expenses, wallet adjustments
- All figures split by channel: cash and bank separately
- Outstanding customer dues and outstanding farmer liabilities clearly shown
- Opening and closing balances (cash and bank)
- Close week action

### 9.11 Customer Wallet and Ledger

- View wallet balance per customer
- Add wallet top-up: amount and channel
- View full ledger: top-ups, order debits, price adjustments, refunds
- View pending balance due from customer

---

## 10. Inventory Model

Per item, per market week:

| Field | Source | Description |
|---|---|---|
| **Preorder Qty** | Aggregated from customer orders | Total quantity ordered by registered customers |
| **Buffer Qty** | Operator-entered | Additional quantity added per outstation farmer-item |
| **Outgoing Qty** | Calculated | Preorder Qty + Buffer Qty — quantity sent to outstation farmer |
| **Delivered Qty** | Volunteer-confirmed on arrival | Actual quantity received; basis for shortfall or overdelivery flags |
| **Walk-in Qty** | Operator-entered on market day | Quantity sold to walk-in buyers from outstation inventory |
| **Local Farmer Inbound Qty** | Operator-entered on market day | Total quantity brought by local farmer per item |
| **Local Farmer Sold Qty** | Operator-recorded | Quantity sold from local farmer inventory (to registered and walk-in customers) |
| **Balance Qty** | Calculated | Delivered Qty − Preorder fulfilled − Walk-in sold |
| **Bill Amount** | Calculated | Total value of items sold across preorder and walk-in at weekly price |

Local farmer inventory is tracked separately from outstation inventory. If both supply the same item, they appear as separate line items; payment attribution is handled manually by the operator.

---

## 11. Payment and Wallet Model

### 11.1 Customer Wallet

- Pre-loaded by customer via UPI or cash; operator confirms top-up in system
- Wallet balance must be ≥ order value before order is confirmed
- Ledger tracks: top-up (credit), order debit, price difference debit or credit, refund (credit)
- Operator has full view; customer can query balance and history via channel decided in Open Decision 2

### 11.2 Price Difference Handling

- Arises when delivered quantity or weight differs from the ordered quantity
- System calculates difference using the agreed weekly price list
- Operator confirms each difference in the reconciliation screen
- Confirmed difference applied as wallet debit (shortfall to customer — customer owes more) or wallet credit (excess — customer overpaid)

### 11.3 Outstation Farmer Payment

- System calculates amount due per farmer per week based on delivered quantity × agreed weekly price
- Operator marks: unpaid / partial (with amount entered) / paid
- Payment channel recorded: cash or bank
- Outstanding liabilities carried into weekly summary

### 11.4 Local Farmer Payment

- System calculates amount due per local farmer based on items sold × agreed weekly price (same price list)
- Operator pays manually at end of market day and marks payment in system
- Payment channel recorded: cash or bank
- Unsold produce returned to farmer — not recorded as an expense

### 11.5 Weekly Financial Summary Structure

All flows tracked across two channels (cash and bank) separately:

- Preorder receipts (cash + bank)
- Market day and walk-in receipts (cash + bank)
- Outstation farmer expenses paid (cash + bank)
- Local farmer expenses paid (cash + bank)
- Wallet adjustments (debits and credits)
- Outstanding farmer liabilities
- Outstanding customer dues
- Opening balance (carried from previous week)
- Closing balance

---

## 12. Key Challenges Being Addressed

| Challenge | How Addressed |
|---|---|
| Manual order recording and aggregation | Operator enters orders into PWA; system aggregates automatically |
| Payment verification via screenshots | Operator confirms payments in system; wallet updated on confirmation |
| Weight vs. unit mismatch reconciliation | System flags differences at reconciliation; wallet adjusted on operator confirmation |
| Buffer calculation errors | System calculates consolidated outstation farmer order with operator-set buffer |
| No audit trail | Full ledger per customer; weekly summary per week; all state changes recorded |
| Outstation farmer payment tracking | Payment status tracked per week; liabilities visible in summary |
| Local farmer payment tracking | Items sold vs. items brought tracked per farmer; payment recorded at day-end |
| Walk-in sales untracked | Operator records walk-in sales in system; contributes to weekly summary |
| Same-item overlap (local + outstation farmer) | Treated as separate physical stock; payment attribution handled manually by operator |

---

## 13. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Language** | Tamil and English; static pre-translated UI labels, notifications, and templates |
| **Device — Operator** | Laptop or tablet (modern browser) |
| **Device — Volunteer** | Low-end Android smartphone; mobile-optimised PWA view |
| **Connectivity** | Functional on slow mobile data (2G/3G) for volunteer view |
| **Cost** | Free-tier and serverless infrastructure only; no paid services in MVP |
| **Data model** | NoSQL document-oriented database |
| **Batch cadence** | Weekly; no real-time inventory or payment processing required |
| **Payment processing** | Manual confirmation only; no automated UPI reconciliation in MVP |

---

## 14. Data Entities (High-Level)

Detailed schema to be specified in PRD.

| Entity | Key Attributes |
|---|---|
| **Outstation Farmer** | ID, name, phone, location, active status |
| **Local Farmer** | ID, name, phone, location, active status |
| **Customer** | ID, name, phone, wallet balance, active status |
| **Product Catalogue** | Item ID, name, default unit type, active status |
| **Market Week** | Week ID, state, produce list, prices, open/close dates |
| **Weekly Produce Item** | Week ID, item ID, unit type, price, inventory fields |
| **Customer Order** | Order ID, week ID, customer ID, line items, status, payment status |
| **Order Line Item** | Item ID, ordered qty, delivered qty, unit price, difference status |
| **Walk-in Sale** | Week ID, item ID, farmer source (outstation/local), qty, amount, channel, timestamp |
| **Farmer Order** | Farmer ID, week ID, line items with buffer, delivered qty, payment status, channel |
| **Local Farmer Inbound** | Farmer ID, week ID, item ID, inbound qty, sold qty, returned qty |
| **Wallet Transaction** | Customer ID, type, amount, channel, week reference, timestamp |
| **Weekly Summary** | Week ID, receipts, expenses, liabilities, dues, opening/closing balances |

---

## 15. Design Principles

1. **Operator-first:** All automation serves the operator. Customer and farmer habits are preserved.
2. **Simplicity over features:** Fewer screens, fewer taps, fewer decisions per action.
3. **WhatsApp as the communication layer:** The system handles data and computation; WhatsApp handles communication.
4. **No runtime AI:** Static multilingual support only (pre-translated Tamil + English). No dynamic translation, no voice, no AI features in MVP.
5. **Zero cost infrastructure:** Free-tier and serverless services throughout MVP.
6. **Manual confirmation for money:** All payment entries and wallet adjustments require explicit operator confirmation. No automated financial transactions.

---

## 16. Constraints

- Weekly batch cadence — system is not real-time
- Inventory quantities are farmer estimates — approximate by nature
- Operator is the sole point of confirmation for all payments and financial adjustments
- No automated UPI reconciliation; operator manually records and confirms all payments
- Customer interaction channel (WhatsApp manual vs. WhatsApp bot) is an open decision — must be resolved before PRD is finalised
- Low technical familiarity of volunteer and customer user base

---

## 17. Out of Scope — MVP

- Farmer-facing interface (outstation or local)
- Customer-facing PWA or app (pending decision on WhatsApp bot)
- Voice ordering or voice-to-text
- Images of produce
- Automated UPI payment reconciliation
- AI-based pricing or recommendations
- Advanced analytics or reporting
- Loyalty or credit programmes
- Walk-in customer conversion flow (loosely registered to fully registered)

---

## 18. Future Scope

- WhatsApp Business API bot for customer order intake (high priority post-MVP decision)
- Farmer-facing PWA for direct produce list submission
- Customer-facing PWA for self-service ordering
- Images of produce in the ordering interface
- Automated UPI reconciliation
- Inventory prediction based on order history
- Voice-based ordering in Tamil
- Advanced analytics and weekly reporting
- Customer wallet top-up via UPI deep-link
- Walk-in customer upgrade path to full registration

---

## 19. Open Decisions (Must Resolve Before PRD Finalisation)

| # | Decision | Options | MVP Fallback | Impact |
|---|---|---|---|---|
| 1 | Customer order intake method | A: Manual WhatsApp → operator entry / B: WhatsApp Business API bot | **Option A** | Determines whether operator enters all orders or system auto-ingests them |
| 2 | Customer self-service query channel | A: Operator-relayed via WhatsApp / B: Minimal read-only PWA view | **Option A** | Determines if customer needs any system access |

---

## 20. Resolved Issues (Confirmed April 2026)

| # | Issue | Resolution |
|---|---|---|
| 1 | Same-item overlap — local farmer and outstation farmer supply same item | Treated as separate physical stock. Outstation items arrive pre-packed against customer orders. Display shows both separately. Payment attribution to each farmer handled manually by operator outside system. No system-level split logic in MVP. |
| 2 | Loosely registered walk-in customer conversion to fully registered | Conversion is possible but not a designed flow in MVP. If operator wishes to fully register a loosely registered customer, it is handled as a fresh registration. No upgrade path logic required. |
| 3 | Local farmer pricing — upfront agreed price or market-day negotiation | One price list applies to all. Local farmer items priced at the weekly produce list price. No separate negotiation, no market-day variance. |

---

*Document prepared for internal use. Do not distribute. Supersedes all prior versions.*
