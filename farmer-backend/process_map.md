# B2C Farmer Marketplace – Process Map

**Version:** 1.0
**Status:** Final – Confirmed Before Interactions Flows
**Last Updated:** April 2026
**Depends On:** context\_v4.md, decisions.md

\---

## Purpose

This document maps the complete weekly operating cycle of the marketplace as it will work in the new system (to-be state). It is organised by lifecycle state, then by actor, then by action. For each action it records: what triggers it, what channel it happens on, what the system does, and what the end state is.

This is the structural backbone for interactions\_flows.md. Every flow in that document maps to one or more rows in this process map.

\---

## How to Read This Document

**Channel key:**

|Symbol|Meaning|
|-|-|
|WA|WhatsApp (outside system — no system record created directly)|
|PWA-OP|Operator PWA dashboard|
|PWA-VOL|Volunteer PWA (mobile)|
|EXT|Outside system entirely (physical, cash, verbal)|

**Action types:**

|Type|Meaning|
|-|-|
|MANUAL|Human action with no system involvement|
|ENTRY|Human action that creates or updates a system record|
|SYSTEM|Automated system action triggered by a prior entry or state change|
|GATE|Action that moves the week to the next lifecycle state|

\---

## Week Lifecycle Overview

```
Setup
  ↓ \[Operator publishes week]
Open for Orders
  ↓ \[Operator locks orders]
Orders Locked
  ↓ \[Operator confirms produce arrived]
Delivery
  ↓ \[Operator opens market day]
Market Day
  ↓ \[Operator opens reconciliation]
Reconciliation
  ↓ \[Operator closes week]
Closed
```

Each state gates which actions are available. Actions attempted outside their permitted state are blocked by the system.

\---

## State 1 — Setup

**Entered when:** Operator creates a new market week in the PWA.
**Exited when:** Operator publishes the week (moves to Open for Orders).
**Duration:** Typically Friday of the preceding week.

### Outstation Farmer Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|1.1|Outstation Farmer|Sends weekly availability list to operator (items, quantities, units)|WA|MANUAL|None — message received outside system|

### Operator Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|1.2|Operator|Reads incoming farmer WhatsApp messages|WA|MANUAL|None|
|1.3|Operator|Creates new market week in PWA|PWA-OP|ENTRY|System creates week record in Setup state|
|1.4|Operator|Adds items to weekly produce list: item name, unit type, price per unit|PWA-OP|ENTRY|System stores each item against the week; validates unit type (kg / piece / bunch / 100g)|
|1.5|Operator|Edits or removes items as needed|PWA-OP|ENTRY|System updates week produce list|
|1.6|Operator|Publishes week|PWA-OP|GATE|System moves week to Open for Orders state; produce list locked from further item deletion (edits to price still permitted)|
|1.7|Operator|Generates formatted produce list for customer broadcast (copy from PWA or manual compose)|PWA-OP|ENTRY|System generates shareable text or image of produce list|
|1.8|Operator|Sends produce list to registered customers via WhatsApp group|WA|MANUAL|None — sending happens outside system|

### End State

Week is in Open for Orders state. Weekly produce list is set with item names, unit types, and prices. Customers have received the list via WhatsApp.

\---

## State 2 — Open for Orders

**Entered when:** Operator publishes the week.
**Exited when:** Operator locks orders (moves to Orders Locked).
**Duration:** Typically Friday through Sunday.

### Registered Customer Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|2.1|Registered Customer|Sends order message to operator via WhatsApp (free-form text, Tamil or English)|WA|MANUAL|WhatsApp Business API webhook receives message; system records receipt timestamp (FCFS anchor)|
|2.2|Registered Customer|Sends advance payment via UPI screenshot or makes cash payment to operator|WA / EXT|MANUAL|None until operator confirms|

### Operator Actions — Order Intake

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|2.3|Operator|Opens order intake queue in PWA — sees incoming customer messages with parsed order previews|PWA-OP|MANUAL|System displays: customer name, original message, parsed line items (product, qty, unit)|
|2.4|Operator|Reviews parsed order; corrects any parsing errors (wrong product, wrong quantity, wrong unit)|PWA-OP|ENTRY|System updates parsed line items in real time as operator edits|
|2.5|Operator|Approves order|PWA-OP|ENTRY|System stores order under customer profile; FCFS timestamp set to message receipt time (step 2.1), not approval time; order status set to Pending Payment|
|2.6|Operator|Flags voice note or unparseable message for manual entry|PWA-OP|ENTRY|System surfaces original message; operator enters order manually; FCFS timestamp set to message receipt time|
|2.7|Operator|Flags order where wallet balance is insufficient|PWA-OP|SYSTEM|System calculates order value vs. wallet balance; flags shortfall; order held in Pending Payment state until wallet is topped up|

### Operator Actions — Wallet Top-Up

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|2.8|Operator|Confirms advance payment received from customer (amount + channel: cash or UPI)|PWA-OP|ENTRY|System credits customer wallet; wallet ledger updated with top-up entry|
|2.9|Operator|Checks wallet balance against order value|PWA-OP|SYSTEM|System validates: if wallet balance ≥ order value, order moves to Confirmed; if not, order remains Pending Payment|
|2.10|Operator|Confirms order once wallet balance is sufficient|PWA-OP|ENTRY|System debits wallet by order value; order status set to Confirmed; wallet ledger updated with order debit entry|

### Operator Actions — Order Lock

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|2.11|Operator|Reviews aggregated order summary per item across all confirmed orders|PWA-OP|MANUAL|System displays total quantity per item across all confirmed customer orders|
|2.12|Operator|Locks orders|PWA-OP|GATE|System moves week to Orders Locked state; no new orders accepted; no order edits permitted|

### End State

Week is in Orders Locked state. All confirmed customer orders are recorded. Wallet balances reflect advance payments received and order debits. FCFS timestamps are set. Aggregated order quantities per item are available.

\---

## State 3 — Orders Locked

**Entered when:** Operator locks orders.
**Exited when:** Operator confirms produce has arrived (moves to Delivery).
**Duration:** Typically Monday.

### Operator Actions — Buffer and Farmer Order

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|3.1|Operator|Sets buffer quantity per item as an absolute quantity in the product's unit (e.g. 2 kg, 5 pieces)|PWA-OP|ENTRY|System calculates: Outgoing Qty = Preorder Qty + Buffer Qty; displays per item|
|3.2|Operator|Reviews consolidated outstation farmer-specific order view|PWA-OP|MANUAL|System displays per-farmer order: items, preorder qty, buffer qty, outgoing qty|
|3.3|Operator|Manually decides how to split aggregated quantity across multiple outstation farmers supplying the same item|PWA-OP|ENTRY|System records farmer-level assignment per item; does not auto-split|
|3.4|Operator|Exports or copies farmer-specific order summary|PWA-OP|ENTRY|System generates per-farmer order text for WhatsApp sharing|
|3.5|Operator|Sends consolidated order to each outstation farmer via WhatsApp|WA|MANUAL|None — sending happens outside system|

### Outstation Farmer Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|3.6|Outstation Farmer|Receives consolidated order from operator via WhatsApp|WA|MANUAL|None|
|3.7|Outstation Farmer|Prepares and dispatches produce|EXT|MANUAL|None|

### End State

Week remains in Orders Locked state (state does not change until produce arrives). All outstation farmer orders have been sent. Buffer quantities and outgoing quantities are set per item.

\---

## State 4 — Delivery

**Entered when:** Operator confirms produce has arrived.
**Exited when:** Operator opens market day (moves to Market Day).
**Duration:** Typically Wednesday to Thursday.

### Volunteer Actions — Delivery Confirmation

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|4.1|Volunteer|Opens PWA; views expected delivery quantities per item|PWA-VOL|MANUAL|System displays: item name, expected (outgoing) qty per item|
|4.2|Volunteer|Records actual delivered quantity per item as produce arrives|PWA-VOL|ENTRY|System records delivered qty; calculates variance (delivered vs. expected); flags shortfalls and overdelivery|
|4.3|System|Flags shortfall items|PWA-VOL / PWA-OP|SYSTEM|System identifies items where delivered qty < preorder qty; applies FCFS rule to determine which customer orders are fully fulfilled and which are partially fulfilled|

### Volunteer Actions — Packing

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|4.4|Volunteer|Views customer-specific packing list|PWA-VOL|MANUAL|System displays packing list sorted by FCFS order; shortfall items show reduced quantities for lower-priority customers|
|4.5|Volunteer|Packs each customer order|EXT|MANUAL|None — physical packing action|
|4.6|Volunteer|Marks each customer order as packed in PWA|PWA-VOL|ENTRY|System updates order status to Packed|

### End State

Week is in Market Day state (after operator opens market day). All arriving produce quantities are recorded. Shortfalls and overdelivery are flagged. All confirmed customer orders are marked as Packed or Partially Packed.

\---

## State 5 — Market Day

**Entered when:** Operator opens market day.
**Exited when:** Operator opens reconciliation (moves to Reconciliation).
**Duration:** Market day — typically Saturday.

### Volunteer Actions — Dispatch

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|5.1|Volunteer|Marks each order as dispatched when registered customer collects|PWA-VOL|ENTRY|System updates order status to Dispatched|

### Registered Customer Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|5.2|Registered Customer|Collects order at market|EXT|MANUAL|None — physical collection|
|5.3|Registered Customer|Pays any balance due (cash or UPI) to operator|EXT|MANUAL|None until operator confirms|

### Operator Actions — Balance Payment

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|5.4|Operator|Records balance payment received from registered customer (amount + channel)|PWA-OP|ENTRY|System credits customer wallet; marks balance as cleared if fully paid|

### Operator Actions — Local Farmer Inbound

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|5.5|Local Farmer|Arrives at market with produce|EXT|MANUAL|None|
|5.6|Operator|Records inbound items and quantities per local farmer|PWA-OP|ENTRY|System stores local farmer inbound qty per item per farmer; items available for walk-in sales|

### Operator Actions — Walk-in Sales

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|5.7|Operator|Records walk-in sale: item, quantity, amount, payment channel (cash or UPI)|PWA-OP|ENTRY|System records sale; deducts from relevant inventory (outstation or local farmer); updates weekly financial summary|
|5.8|Operator|Optionally records walk-in customer name and phone number|PWA-OP|ENTRY|System stores loosely registered customer record; linked to sale|

### End State

Week moves to Reconciliation state (after operator opens reconciliation). All registered customer orders are dispatched. Local farmer inbound quantities are recorded. Walk-in sales are recorded. Balance payments received from registered customers are recorded.

\---

## State 6 — Reconciliation

**Entered when:** Operator opens reconciliation.
**Exited when:** Operator closes the week (moves to Closed).
**Duration:** End of market day or following day.

### Operator Actions — Price Difference Resolution

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|6.1|System|Flags price differences|PWA-OP|SYSTEM|System compares delivered qty vs. ordered qty per customer order line item; calculates monetary difference at weekly price; lists all flagged items|
|6.2|Operator|Reviews each flagged difference|PWA-OP|MANUAL|System displays: customer name, item, ordered qty, delivered qty, price difference amount|
|6.3|Operator|Confirms each difference|PWA-OP|ENTRY|System applies wallet debit (customer received less — owes more) or wallet credit (customer received more — overpaid); wallet ledger updated|

### Operator Actions — Outstation Farmer Payment

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|6.4|Operator|Reviews amount due per outstation farmer (delivered qty × agreed price)|PWA-OP|MANUAL|System displays per-farmer: items delivered, qty, price, total due|
|6.5|Operator|Marks outstation farmer payment status: unpaid / partial (enters amount) / paid|PWA-OP|ENTRY|System records payment status and channel (cash or UPI); calculates outstanding liability if partial|
|6.6|Operator|Pays outstation farmer|EXT|MANUAL|None — physical payment|

### Operator Actions — Local Farmer Payment

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|6.7|Operator|Reviews amount due per local farmer (items sold × agreed weekly price)|PWA-OP|MANUAL|System displays per-farmer: items brought, items sold, items unsold, total due|
|6.8|Operator|Pays local farmer|EXT|MANUAL|None — physical payment|
|6.9|Operator|Records local farmer payment in system (amount + channel)|PWA-OP|ENTRY|System marks local farmer as paid for the week; records channel (cash or UPI)|
|6.10|Local Farmer|Takes back unsold produce|EXT|MANUAL|None — no system record required|

### End State

All price differences are resolved and wallet adjustments are applied. All outstation farmer payment statuses are marked. All local farmer payments are recorded. System is ready for week close.

\---

## State 7 — Closed

**Entered when:** Operator closes the week.
**Exited when:** Never — Closed is terminal for that week.
**Duration:** Permanent.

### Operator Actions

|#|Actor|Action|Channel|Type|System Response|
|-|-|-|-|-|-|
|7.1|Operator|Closes week|PWA-OP|GATE|System moves week to Closed state; all edits locked; weekly financial summary generated|
|7.2|Operator|Reviews weekly financial summary|PWA-OP|MANUAL|System displays: preorder receipts (cash + bank), market day receipts (cash + bank), outstation farmer expenses (cash + bank), local farmer expenses (cash + bank), wallet adjustments, outstanding customer dues, outstanding farmer liabilities, opening balance, closing balance|

### End State

Week is Closed. No further edits permitted. Weekly financial summary is available read-only. Outstanding dues and liabilities carry into the next week's opening balance.

\---

## Cross-State Actions

These actions are not tied to a single state. They are available whenever the operator needs them.

|#|Actor|Action|Channel|Type|Permitted In States|System Response|
|-|-|-|-|-|-|-|
|X.1|Operator|Registers new outstation or local farmer|PWA-OP|ENTRY|Any|System creates farmer record|
|X.2|Operator|Registers new customer|PWA-OP|ENTRY|Any|System creates customer record with zero wallet balance|
|X.3|Operator|Adds wallet top-up for customer|PWA-OP|ENTRY|Setup, Open for Orders, Orders Locked, Delivery, Market Day|System credits wallet; updates ledger|
|X.4|Operator|Views customer wallet balance and ledger|PWA-OP|MANUAL|Any|System displays full ledger history|
|X.5|Operator|Views outstanding farmer payment liabilities|PWA-OP|MANUAL|Any|System displays unpaid and partial amounts per farmer across all weeks|

\---

## Action Count by Actor

|Actor|Total Actions|PWA Actions|WhatsApp / External Actions|
|-|-|-|-|
|Operator|38|29|9|
|Volunteer|6|4|2 (physical)|
|Registered Customer|3|0|3 (WA + physical)|
|Outstation Farmer|3|0|3 (WA + physical)|
|Local Farmer|2|0|2 (physical)|

The operator carries the dominant system interaction load by design. Volunteer PWA actions are scoped to delivery confirmation and packing. All farmer and customer actions remain off-system in MVP.

\---

## State-Action Gate Summary

|Action|Setup|Open for Orders|Orders Locked|Delivery|Market Day|Reconciliation|Closed|
|-|-|-|-|-|-|-|-|
|Enter produce list|✅|❌|❌|❌|❌|❌|❌|
|Enter customer orders|❌|✅|❌|❌|❌|❌|❌|
|Record wallet top-up|✅|✅|✅|✅|✅|❌|❌|
|Lock orders|❌|✅|❌|❌|❌|❌|❌|
|Set buffer / farmer orders|❌|❌|✅|❌|❌|❌|❌|
|Confirm delivery quantities|❌|❌|❌|✅|❌|❌|❌|
|Mark orders packed|❌|❌|❌|✅|❌|❌|❌|
|Mark orders dispatched|❌|❌|❌|❌|✅|❌|❌|
|Record local farmer inbound|❌|❌|❌|❌|✅|❌|❌|
|Record walk-in sales|❌|❌|❌|❌|✅|❌|❌|
|Reconcile price differences|❌|❌|❌|❌|❌|✅|❌|
|Mark farmer payments|❌|❌|❌|❌|❌|✅|❌|
|Close week|❌|❌|❌|❌|❌|✅|❌|
|View financial summary|❌|❌|❌|❌|❌|❌|✅|

\---

*Document prepared for internal use. Do not distribute.*

