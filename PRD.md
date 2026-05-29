# B2C Farmer Marketplace — Product Requirements Document

**Version:** 1.0  
**Status:** Implementation-Ready  
**Last Updated:** April 2026  
**Depends On:** context\_v4.md · decisions.md · process\_map.md · interactions\_flows.md v1.1

\---

## Table of Contents

1. [Product Overview and Guiding Principles](#1-product-overview-and-guiding-principles)
2. [Actors and Access Model](#2-actors-and-access-model)
3. [Market Week Lifecycle and State Machine](#3-market-week-lifecycle-and-state-machine)
4. [Functional Requirements — Operator PWA](#4-functional-requirements--operator-pwa)
5. [Functional Requirements — Volunteer PWA](#5-functional-requirements--volunteer-pwa)
6. [WhatsApp Business API Integration](#6-whatsapp-business-api-integration)
7. [Wallet and Payment Model](#7-wallet-and-payment-model)
8. [Inventory Model](#8-inventory-model)
9. [Reconciliation Model](#9-reconciliation-model)
10. [Weekly Financial Summary](#10-weekly-financial-summary)
11. [Data Model](#11-data-model)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Out of Scope — MVP](#13-out-of-scope--mvp)
14. [Open Items and Post-MVP Roadmap](#14-open-items-and-post-mvp-roadmap)

\---

## 1\. Product Overview and Guiding Principles

### 1.1 Background

A community-driven organic market operates weekly in the Gudalur–Ooty region. Approximately 15 outstation farmers supply fresh organic produce. Approximately 50 registered customers pre-order weekly. The market also serves walk-in buyers on market day, including anonymous buyers and loosely registered buyers whose name and phone are optionally recorded.

The current system is entirely manual — farmers communicate availability via WhatsApp, the operator consolidates orders in Excel, customers place orders via WhatsApp messages, and payments are tracked via UPI screenshots and cash. This is functional at current scale but is not sustainable as the community grows.

This PRD specifies the MVP digital system. The deliverable is an operator-first Progressive Web Application (PWA) that digitises high-effort operator workflows without disrupting the WhatsApp-based habits of farmers and customers.

### 1.2 Guiding Principle

> \*\*Automate high-impact operator actions. Preserve low-impact manual habits.\*\*

All automation is directed at reducing operator effort. The system is built around the operator, not the end user. The six design principles that follow from this guiding principle are:

1. **Operator-first.** All screens and automation serve the operator. Customer and farmer habits are not disrupted in MVP.
2. **Simplicity over features.** Fewer screens, fewer taps, fewer decisions per action.
3. **WhatsApp as the communication layer.** The system handles data and computation. WhatsApp handles communication.
4. **No runtime AI.** Static multilingual support only — pre-translated Tamil and English UI labels and message templates. No dynamic translation, no speech-to-text, no AI features in MVP.
5. **Zero cost infrastructure.** Free-tier and serverless services throughout MVP.
6. **Manual confirmation for money.** All payment entries and wallet adjustments require explicit operator confirmation. No automated financial transactions.

### 1.3 Scope Summary

The MVP covers the complete weekly operating cycle from produce list setup through week close and financial summary generation. It covers the operator PWA dashboard, the volunteer mobile PWA, WhatsApp Business API order intake with rule-based parsing, customer wallet management, outstation and local farmer inventory tracking, price difference reconciliation, farmer payment recording, and the weekly financial summary.

\---

## 2\. Actors and Access Model

### 2.1 Actor Summary

|Actor|Approx. Count|System Interface|Access Level|
|-|-|-|-|
|Operator|1–3 persons|PWA on laptop or tablet|Full — all screens and actions|
|Volunteer|Variable|Mobile PWA on Android|Restricted — packing and dispatch only|
|Registered Customer|\~50|None (WhatsApp only)|No system access|
|Outstation Farmer|\~15|None (WhatsApp only)|No system access|
|Local Farmer|5–10|None (physical / WhatsApp)|No system access|
|Walk-in Customer|Variable|None (physical only)|No system access|

### 2.2 Operator

The operator has full read and write access to all system functions. In MVP, all operators share the same access level — there is no role differentiation between multiple operators. The operator is the sole point of confirmation for all payments, wallet adjustments, state transitions, and financial entries.

Operator device: laptop or tablet running a modern browser. The operator PWA is not required to function on a small mobile screen.

### 2.3 Volunteer

The volunteer accesses the system via a mobile-optimised PWA view on a low-end Android smartphone. Volunteer access is read-heavy with a narrow write scope.

**Permitted actions:**

* View the packing list sorted by FCFS order
* Record actual delivered quantities per item on produce arrival (Delivery state)
* Mark individual customer orders as Packed (Delivery state)
* Mark individual customer orders as Dispatched (Market Day state)
* View balance due per customer at the dispatch point (read-only)

**Explicitly prohibited actions:**

* Recording walk-in sales
* Editing any order
* Recording any payment or wallet entry
* Accessing any financial data beyond balance due at dispatch
* Triggering any state transition

### 2.4 Registered Customer

No system access in MVP. All interaction is via WhatsApp with the operator. The system maintains a profile per registered customer including wallet balance, wallet ledger, and order history.

**Registration fields:** Full name, WhatsApp phone number (primary unique identifier for message matching), active status.

**Wallet:** Pre-loaded by the operator on payment confirmation. Cannot be debited below zero by any automated system action.

### 2.5 Walk-in Customer

Walk-in customers exist in three states. Wallet and pre-order logic apply only to fully registered customers.

|State|Registration|What the System Records|
|-|-|-|
|Anonymous|None|Nothing|
|Loosely registered|Name and phone optionally captured by operator at point of sale|Name, phone, sale record only — no wallet, no pre-order|
|Fully registered|Same as Registered Customer|Full profile with wallet|

Conversion from loosely registered to fully registered is not a designed flow in MVP. The operator handles it as a fresh registration if required.

### 2.6 Outstation Farmer

Registered once by the operator. No system access. Receives consolidated weekly orders from the operator via WhatsApp. Payment due is tracked in the system per week; the operator marks payment status.

**Registration fields:** Full name, WhatsApp phone number, location or village, active status.

### 2.7 Local Farmer

Registered once by the operator. No system access. Arrives at market on market day; the operator records inbound items and quantities. Payment is calculated on items sold at the weekly price and recorded by the operator at end of market day.

**Registration fields:** Full name, WhatsApp phone number, location or village, active status.

\---

## 3\. Market Week Lifecycle and State Machine

### 3.1 States

The market week moves through seven states in a fixed sequence. Each state gates which actions are available. Actions attempted outside their permitted state are rejected by the system with an explanatory error message.

|#|State|Description|Entered By|
|-|-|-|-|
|1|**Setup**|Week created; produce list being built|Operator creates new week|
|2|**Open for Orders**|Produce list published; customer orders being received and confirmed|Operator publishes week|
|3|**Orders Locked**|Orders closed; buffer set; farmer orders being prepared|Operator locks orders|
|4|**Delivery**|Produce arrived; volunteer records quantities; packing in progress|Operator confirms produce arrived|
|5|**Market Day**|Customer collection, walk-in sales, local farmer inbound|Operator opens market day|
|6|**Reconciliation**|Price differences confirmed; farmer payments recorded|Operator opens reconciliation|
|7|**Closed**|Week closed; summary generated; all data locked|Operator closes week|

State transitions are one-way and sequential. There is no reverse transition in MVP.

### 3.2 State Transition Diagram

```
\[Setup]
   |
   |  Operator: Publish Week
   |  (produce list must have >= 1 item)
   v
\[Open for Orders]
   |
   |  Operator: Lock Orders
   |  (all Pending Payment orders must be resolved first)
   v
\[Orders Locked]
   |
   |  Operator: Confirm Produce Arrived
   v
\[Delivery]
   |
   |  Operator: Open Market Day
   v
\[Market Day]
   |
   |  Operator: Open Reconciliation
   v
\[Reconciliation]
   |
   |  Operator: Close Week
   |  (blocked until all price differences confirmed,
   |   all outstation farmer statuses marked,
   |   all local farmer payments recorded)
   v
\[Closed]
```

### 3.3 State-Action Gate Table

|Action|Setup|Open|Locked|Delivery|Mkt Day|Recon|Closed|
|-|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|Add / edit produce list items|Y|Y\*|N|N|N|N|N|
|Delete produce list items|Y|N|N|N|N|N|N|
|Publish week|Y|N|N|N|N|N|N|
|Receive and parse customer messages|N|Y|N|N|N|N|N|
|Confirm customer orders|N|Y|N|N|N|N|N|
|Record wallet top-up|Y|Y|Y|Y|Y|Y\*\*|N|
|Edit confirmed order (pre-lock)|N|Y|N|N|N|N|N|
|Cancel order|N|Y|N|N|N|N|N|
|Lock orders|N|Y|N|N|N|N|N|
|Set buffer and farmer assignments|N|N|Y|N|N|N|N|
|Confirm produce arrived|N|N|Y|N|N|N|N|
|Record delivered quantities (volunteer)|N|N|N|Y|N|N|N|
|Edit delivered quantities (operator)|N|N|N|Y|N|Y\*\*\*|N|
|Mark orders Packed|N|N|N|Y|N|N|N|
|Open market day|N|N|N|Y|N|N|N|
|Mark orders Dispatched|N|N|N|N|Y|N|N|
|Record local farmer inbound|N|N|N|N|Y|N|N|
|Record walk-in sales|N|N|N|N|Y|N|N|
|Record balance payment|N|N|N|N|Y|N|N|
|Open reconciliation|N|N|N|N|Y|N|N|
|Edit local farmer sold qty|N|N|N|N|N|Y|N|
|Confirm price differences|N|N|N|N|N|Y|N|
|Mark outstation farmer payments|N|N|N|N|N|Y|N|
|Record local farmer payments|N|N|N|N|N|Y|N|
|Close week|N|N|N|N|N|Y\*\*\*\*|N|
|View weekly financial summary|N|N|N|N|N|N|Y|
|Register farmer or customer|Y|Y|Y|Y|Y|Y|Y|
|View customer wallet and ledger|Y|Y|Y|Y|Y|Y|Y|
|View outstanding farmer liabilities|Y|Y|Y|Y|Y|Y|Y|

\* Price edits permitted after publishing; item deletion is not permitted after publishing.  
\*\* Wallet top-up is permitted in Reconciliation state. This is required to allow the operator to collect and record payment from customers whose wallet was debited to zero by overdelivery charges. Top-ups in Reconciliation are included in the weekly financial summary.  
\*\*\* Operator may edit delivered quantities at the start of Reconciliation state before confirming any price differences, to correct volunteer entry errors.  
\*\*\*\* Week close is blocked until all price differences are confirmed, all outstation farmer payment statuses are set, and all local farmer payments are recorded.

### 3.4 Price Edit After Publishing — Confirmed Behaviour

When the operator edits an item price after the week is in Open for Orders state:

1. System updates the price on the produce list immediately.
2. System recalculates the order value for every Confirmed order that contains that item.
3. For any Confirmed order whose recalculated value now exceeds the customer's current wallet balance: the system reverts that order to Pending Payment and flags it in the operator's queue with the reason "Price change — wallet shortfall."
4. Orders not affected (wallet still covers the new value, or the price decreased) remain Confirmed. The wallet debit is adjusted to reflect the new order value.
5. The operator informs affected customers via WhatsApp and collects the shortfall before re-confirming.

Price edits are not permitted once the week moves to Orders Locked state.

### 3.5 Order Lock Gate

Before the operator can lock orders, the system checks that no orders are in Pending Payment status. If any exist, the system lists them and blocks the lock action. The operator must resolve each one — either by recording the customer's payment (which triggers confirmation) or by cancelling the order. There is no post-lock path to confirm a Pending Payment order.

\---

## 4\. Functional Requirements — Operator PWA

### 4.1 Master Data and Registration

#### 4.1.1 Product Catalogue

The product catalogue is a shared master list of all items that can appear on any weekly produce list. It persists across weeks.

**Requirements:**

* Operator can add an item: name in English (required), name in Tamil (optional), default unit type (kg / piece / bunch / 100g).
* Operator can edit any item's name or default unit type at any time.
* Operator can deactivate an item (soft delete). Deactivated items do not appear in produce list entry or order screens but historical data is preserved.
* When building a weekly produce list, the operator can select from the catalogue or add a new item inline. Inline additions are saved to the catalogue automatically.

#### 4.1.2 Farmer Registration

Applies to both outstation and local farmers. Registration is available in all week states.

**Requirements:**

* Operator registers a farmer: full name, WhatsApp phone number, location or village name, farmer type (outstation / local), active status.
* Phone number is unique per farmer. System rejects duplicate phone numbers.
* Operator can edit any field at any time.
* Operator can deactivate a farmer. Deactivated farmers do not appear in farmer selection screens. Historical records are preserved.
* Farmer list is filterable by type and status.

#### 4.1.3 Customer Registration

Registration is available in all week states.

**Requirements:**

* Operator registers a customer: full name, WhatsApp phone number (required), active status.
* Phone number is the unique identifier for registered customers and is used to match incoming WhatsApp messages. System rejects duplicate phone numbers.
* Wallet balance initialises at zero on registration.
* Operator can edit name and phone at any time.
* Operator can deactivate a customer. Deactivated customers do not appear in order entry. Wallet and order history are preserved.
* Customer list is searchable by name and phone number.

### 4.2 Week Setup and Produce List

**Available in:** Setup state (full edit), Open for Orders state (price edits only — no deletions).

**Requirements:**

**Create week:**

* Operator selects market date from a date picker. System rejects a date that duplicates an existing week.
* System creates week record in Setup state with an empty produce list.

**Build produce list:**

* Operator adds items one at a time: select from product catalogue (or add inline), confirm or override unit type, enter price per unit (positive number, required).
* Permitted unit types: kg, piece, bunch, 100g. System rejects any other value.
* Operator can edit any item (price, unit type) in Setup state.
* Operator can delete any item in Setup state.
* Produce list must contain at least one item before the week can be published.

**Publish week:**

* Operator taps Publish. System moves week to Open for Orders state.
* From this point: item deletion is blocked. Price edits remain permitted (with the revert-to-Pending-Payment behaviour in Section 3.4).

**Formatted list generation:**

* System generates a copyable produce list text in both Tamil and English. Format: item name, unit type, price per unit — one item per line.
* Operator copies and sends to the registered customer WhatsApp group manually. The system does not send this message.

### 4.3 Order Intake Queue

**Available in:** Open for Orders state only.

This is the primary screen for the B-Assisted order intake flow. It displays all incoming WhatsApp messages alongside their parsed order previews.

**Queue display:**

* Messages listed in chronological order (oldest unprocessed first).
* Each queue entry shows: customer name (matched by phone number) or "Unknown customer" if phone is unregistered, FCFS timestamp (WhatsApp API message receipt time), original message text verbatim, parsed order preview, parse status badge (Clean / Partial / Manual Required / Voice Note / Image).
* Queue count badge shows number of unprocessed messages.
* Messages from unknown phone numbers are flagged. Operator must register the customer before an order can be entered for them.

**Parsed order preview:**

* Each extracted line item shows: matched product name from the current week's produce list, quantity (numeric), canonical unit.
* Unmatched tokens are shown highlighted with the original raw text alongside a product selector dropdown.
* Operator can edit any line item: change product (dropdown limited to current week's produce list), adjust quantity (numeric), change unit (dropdown limited to valid unit types).
* Operator can add a line item manually.
* Operator can remove a line item.

**Approval actions:**

* **Approve:** System validates wallet balance against total order value.

  * Wallet >= order value: order confirmed, wallet debited, FCFS timestamp set to message receipt time, queue entry cleared.
  * Wallet < order value: order saved as Pending Payment, shortfall amount displayed, queue entry cleared. Customer appears in Pending Payment list (Section 4.4.3).
* **Reject:** Operator may optionally add a comment. Message archived with rejected status. No order created. Queue entry cleared.

**Voice notes and images:**

* Voice notes: flagged as "Voice note — manual entry required." Operator enters all line items manually via the standard line item interface. FCFS timestamp is the voice note receipt time.
* Images: flagged as "Image — manual entry required." Same handling as voice notes.
* Zero-parse messages (no line items extracted from text): flagged as "Could not parse — manual entry required." Original message shown in full. Operator enters line items manually.

**The system must never silently drop a received WhatsApp message.** Every message received via the webhook must appear in the queue and remain there until the operator explicitly approves or rejects it. Messages received when no week is in Open for Orders state are stored and flagged as "No active week — manual review required."

### 4.4 Order Management

**Available in:** Open for Orders state (full edit), all other non-Closed states (read-only).

#### 4.4.1 Order List View

* Lists all customer orders for the currently selected week.
* Filterable by status: All / Confirmed / Pending Payment / Cancelled.
* Each row shows: customer name, order value, wallet balance, status, FCFS timestamp.
* Searchable by customer name and phone number.

#### 4.4.2 Order Detail View

* Shows: customer name, phone number, FCFS timestamp, order status, each line item (product name, ordered quantity, unit, line value), total order value, wallet balance at time of confirmation, current wallet balance.
* In Open for Orders state: operator can edit any line item of a Confirmed order.

  * New value > old value and wallet covers the difference: wallet debited for the difference, order remains Confirmed.
  * New value > old value and wallet does not cover: order reverts to Pending Payment. Operator informed of shortfall.
  * New value < old value: wallet credited for the reduction. Order remains Confirmed.
  * FCFS timestamp is not changed by order edits.
* Operator can cancel a Confirmed order in Open for Orders state. System credits the wallet with the full order value previously debited.

#### 4.4.3 Pending Payment List

* Separate view listing all Pending Payment orders for the current week: customer name, order value, current wallet balance, shortfall amount.
* When a top-up is recorded for a customer who has a Pending Payment order, the system checks whether the updated balance covers the order value and prompts the operator to confirm the order.
* Operator confirms the order in one tap. System debits wallet, sets order to Confirmed, retains original FCFS timestamp.
* If the wallet is still insufficient after the top-up, the order remains in Pending Payment and the shortfall amount is updated.

#### 4.4.4 Aggregated Order Summary

* Available in Open for Orders and Orders Locked states.
* Shows total Confirmed quantity per item across all Confirmed customer orders: item name, unit type, total quantity.
* Used by the operator to review totals before locking and to reference when setting buffer quantities.

### 4.5 Wallet Management

**Available in:** All states except Closed (top-up). View and ledger available in all states including Closed.

#### 4.5.1 Customer Wallet View

Accessible from the customer list or from within any order detail.

* Displays: customer name, current wallet balance, full ledger history in reverse chronological order.
* Each ledger entry shows: date and time, entry type (Top-up / Order Debit / Order Debit Reversal / Price Difference Credit / Price Difference Debit / Customer Due / Balance Payment / Manual Adjustment), amount, payment channel (Cash / UPI / System), week reference, running balance after this entry.

#### 4.5.2 Top-Up Entry

* Operator selects customer, enters amount (positive number), selects channel (Cash or UPI), optionally enters a reference note (e.g., UPI transaction reference).
* System credits wallet immediately on save. Ledger updated.
* No top-up entry can be reversed by the system — corrections require a new Manual Adjustment entry with a mandatory reason note.

### 4.6 Farmer Order Management

**Available in:** Orders Locked state only.

#### 4.6.1 Aggregated and Buffer View

* Displays per item: item name, unit type, total confirmed preorder quantity, operator-set buffer percentage, calculated buffer quantity (preorder qty × buffer%), calculated outgoing quantity (preorder qty + buffer qty).
* Operator sets buffer percentage per item. Entered as a percentage (0–100%). Typical range 10–30%. No system-enforced minimum or maximum.
* Buffer is per item, not per farmer. A single buffer percentage applies to the total outgoing quantity for that item regardless of how many farmers supply it.
* System recalculates outgoing quantity live as the operator adjusts each buffer value.

#### 4.6.2 Farmer Assignment View

* For each item, operator assigns the outgoing quantity to one or more outstation farmers: select farmer, enter quantity assigned to that farmer.
* If multiple farmers supply the same item, the operator manually decides the split and enters quantities per farmer.
* System displays a variance indicator if the sum of farmer-assigned quantities differs from the calculated outgoing quantity. This is a warning only — it does not block the operator.
* System stores per-farmer assignments: farmer ID, item ID, week ID, preorder qty, buffer qty, assigned outgoing qty.

#### 4.6.3 Per-Farmer Order Export

* System generates a per-farmer order summary: farmer name, each assigned item with preorder qty, buffer qty, and outgoing qty.
* Operator can copy this as a formatted text string in Tamil or English, ready to paste into a WhatsApp message.
* The system does not send WhatsApp messages. The operator copies and pastes.

### 4.7 Delivery Management

**Available in:** Orders Locked state (to trigger Delivery) and Delivery state (review and edit).

**Requirements:**

* Operator taps "Confirm Produce Arrived." System moves week to Delivery state. Volunteer PWA delivery screen becomes active.
* In Delivery state: operator can review all delivered quantity entries made by volunteers, see shortfall and overdelivery flags per item, and review FCFS-adjusted packing allocations per customer.
* Operator can edit any volunteer-entered delivered quantity in Delivery state before opening reconciliation. This is the correction window for delivery quantity errors.
* Operator taps "Open Market Day" to move week to Market Day state. Volunteer dispatch screen becomes active.

### 4.8 Market Day Operations

#### 4.8.1 Local Farmer Inbound Recording

**Available in:** Market Day state.

* Operator selects a registered local farmer.
* Operator records inbound items: select item from current week's produce list or add a new item with a manually entered price and unit type.

  * Items added here that are not on the weekly produce list are available for walk-in sales only. They do not appear on registered customer preorder records.
* Operator enters inbound quantity per item.
* System stores the local farmer inbound record: local farmer ID, week ID, item ID, inbound quantity, unit type, price per unit.
* Multiple local farmers are recorded independently. Each farmer has a separate inbound record.

#### 4.8.2 Walk-in Sales

**Available in:** Market Day state. Operator access only — volunteers do not have write access to this screen.

* Operator opens the walk-in sales screen.
* Operator selects an item from the current week's produce list or from local-farmer-only items added in inbound recording.
* Operator selects inventory source: Outstation Farmer Inventory or Local Farmer Inventory.

  * If Local Farmer Inventory: operator selects the specific local farmer from those who have an inbound record for that item this week.
* Operator enters quantity sold and amount collected.
* Operator selects payment channel (Cash or UPI).
* Operator optionally records customer name and phone number. If the phone matches an existing record, it is linked. If not, a new loosely registered customer record is created.
* System records the sale, deducts from the selected inventory source, updates the weekly financial summary.
* If available quantity in the selected inventory source is insufficient, the system displays a warning. The operator can proceed or cancel — this is not a hard block, since the operator may have physical stock not yet recorded in the system.
* A single walk-in transaction records one item from one inventory source. A customer purchasing from both outstation and local farmer stock requires two separate transaction entries.
* Walk-in sales can be entered in real time during market day or in a batch session at end of day.

#### 4.8.3 Balance Payment Recording

**Available in:** Market Day state.

* Operator selects a registered customer.
* System shows: order summary, amount originally debited from wallet, outstanding balance due.
* Operator enters amount received and channel (Cash or UPI).
* System credits wallet. Ledger updated. Order marked as balance cleared if outstanding balance reaches zero.
* Balance payment recording is an operator-only action.

#### 4.8.4 Uncollected Orders

When an order is not collected on market day, it remains in Packed status. The operator decides the outcome: dispose of the produce or contact the customer. The operator marks the order as Delivered with an optional comment (e.g., "Not collected — produce disposed" or "Not collected — customer informed for next week"). No automated system action is taken.

### 4.9 Reconciliation

**Available in:** Reconciliation state. Operator opens reconciliation from Market Day state by tapping "Open Reconciliation."

#### 4.9.1 Price Difference Confirmation

On entering Reconciliation state, the system automatically identifies all order line items where delivered quantity differs from ordered quantity and calculates the monetary difference.

**Display per flagged item:** customer name, item, ordered quantity, delivered quantity, difference quantity, price per unit, monetary difference (positive = customer owes more for overdelivery; negative = customer is owed a credit for shortfall).

**Operator can edit delivered quantity** for any line item before confirming the difference. This corrects volunteer entry errors. Editing delivered quantity recalculates the monetary difference in real time.

**On operator confirmation of each difference:**

Shortfall (delivered quantity less than ordered quantity):

* System credits customer wallet by the overpayment amount — the customer paid for produce they did not receive.
* Ledger entry type: Price Difference Credit.

Overdelivery (delivered quantity greater than ordered quantity):

* System debits customer wallet by the additional amount owed.
* If the debit would reduce the wallet below zero: system debits to zero, records the remainder as a Customer Due entry in the ledger, and surfaces the outstanding due in the weekly financial summary. The operator collects this amount manually at the next customer interaction.
* Ledger entry type: Price Difference Debit. If capped at zero, a separate Customer Due entry records the unrecovered amount.

Items with no difference (delivered = ordered) do not appear in this screen.

The operator cannot close the week until all flagged differences are confirmed. Partial reconciliation across sessions is permitted — the week close gate checks for zero unconfirmed items.

#### 4.9.2 Outstation Farmer Payment Recording

**Display per outstation farmer:** farmer name, list of items delivered this week, delivered quantity per item, price per unit, line value, total amount due.

Outstation farmer payment is calculated on delivered quantity, not ordered quantity.

**Operator marks payment status for each farmer:**

* **Unpaid:** No further input required. Full amount recorded as outstanding liability.
* **Partial:** Operator enters amount paid and payment channel (Cash or UPI). System records outstanding liability = total due minus amount paid.
* **Paid:** Operator enters payment channel (Cash or UPI). System records full payment. No outstanding liability.

Outstanding liabilities for outstation farmers carry forward into the next week's summary as prior-week liabilities.

The operator must mark a payment status for every outstation farmer who delivered produce this week before the week can be closed. Unpaid is a valid status — it signals the operator has acknowledged the liability, not that it is resolved.

#### 4.9.3 Local Farmer Payment Recording

**Display per local farmer:** farmer name, items brought (inbound quantity), items sold (sold quantity — operator-editable in Reconciliation state), items unsold (inbound minus sold), amount due per item (sold qty × weekly price), total amount due.

Operator can edit sold quantity for any item before recording payment (used when the farmer disputes the recorded sold quantity at end of market day).

**Recording payment:**

* Operator enters amount paid and payment channel (Cash or UPI).
* System marks local farmer as paid for the week. Ledger updated.

**Local farmer payment is same-week only.** There is no carry-forward of local farmer liabilities to the next week. The system records what the operator actually paid — no outstanding liability tracking for local farmers.

Unsold produce is returned to the local farmer. The system records unsold quantity for reference but does not treat it as an expense.

The operator must complete a payment record for every local farmer who brought produce this week before the week can be closed.

### 4.10 Week Close

**Available in:** Reconciliation state only, after all gate conditions are met.

**Pre-close system validation:**

1. All price difference line items confirmed — zero unconfirmed items remaining.
2. All outstation farmers with deliveries this week have a payment status set (Unpaid / Partial / Paid).
3. All local farmers with inbound records this week have a payment record completed.

If any condition fails, the system displays the blocking items by category and prevents close. Force-close is not permitted under any condition.

**On passing all validations:**

* Operator taps Close Week and confirms.
* System moves week to Closed state. All data entry is locked — no further edits permitted.
* System generates the weekly financial summary (see Section 10).
* Weekly financial summary is available as a permanent read-only view from the week detail screen.

\---

## 5\. Functional Requirements — Volunteer PWA

The volunteer interface is a mobile-optimised PWA. All screens must be usable on a low-end Android device on a 2G/3G connection. Target page weight per screen: under 100KB on initial load after first visit (service worker cached).

### 5.1 Delivery Quantity Entry

**Available in:** Delivery state.

* Volunteer opens PWA. Sees the expected delivery list for the current week: item name, unit type, expected (outgoing) quantity as ordered from outstation farmers.
* Volunteer enters actual delivered quantity per item as produce physically arrives. Input is a numeric field per item.
* System records delivered quantity per item, calculates variance, and displays shortfall and overdelivery flags with clear visual indicators.
* For shortfall items: system displays the FCFS-ranked customer allocation — which customers receive their full ordered quantity and which receive a reduced quantity.
* Volunteer can edit a delivered quantity entry at any time while the week is in Delivery state.
* After the operator opens Reconciliation state, delivered quantities can only be edited by the operator (Section 4.9.1).

**Offline tolerance:** The volunteer screen must retain entered values if connectivity is lost and sync when connectivity is restored. Implementation: service worker caches unsaved form state locally.

### 5.2 Packing List

**Available in:** Delivery state.

* Displays customer orders to be packed, one card per customer.
* Default sort: FCFS timestamp ascending (earliest order first).
* Per customer card: customer name, list of items to pack with quantities (FCFS-adjusted for shortfall items — the volunteer packs the adjusted quantity, not the originally ordered quantity), FCFS rank position for shortfall items, packed or unpacked status.
* Volunteer marks each order as Packed with a single tap per order. No line-item-level confirmation required.
* Packed orders are visually differentiated (greyed out or marked complete). A filter to show unpacked orders only is available.
* Screen must function with minimal data transfer. No images, no heavy assets.

### 5.3 Dispatch

**Available in:** Market Day state.

* Displays all Packed orders for the current week.
* Searchable by customer name.
* Per order entry: customer name, items and quantities in the order, balance due (read-only, for the volunteer to direct the customer to the operator for payment collection).
* Volunteer marks order as Dispatched with a single tap when the customer collects their order.
* Dispatched orders move to a completed section or are visually marked as done.
* Balance due is a display field only. The volunteer does not record balance payments — that is an operator action.

\---

## 6\. WhatsApp Business API Integration

### 6.1 Prerequisites

The following must be in place before MVP launch:

* A verified WhatsApp Business API account linked to the operator's business phone number.
* An always-on webhook endpoint capable of receiving WhatsApp message events, hosted on free-tier serverless infrastructure (e.g., Render, Railway, or equivalent). Must be reachable 24/7 since customer messages arrive at unpredictable times.
* Registered customer phone numbers seeded in the system so incoming messages can be matched to customer records.

### 6.2 Message Ingestion Flow

On receiving a message event from the WhatsApp Business API webhook:

1. System records: WhatsApp message ID, sender phone number, message body (text) or media type flag (audio / image / other), receipt timestamp from the WhatsApp API event payload. The API timestamp — not the server clock — is the FCFS anchor.
2. System matches sender phone number against registered customer list. Records matched customer ID, or flags as unknown sender if no match.
3. System checks whether a week is currently in Open for Orders state. If yes, associates the message with that week. If no active week, message is stored and flagged as "No active week — manual review required."
4. For text messages: system runs the rule-based parser (Section 6.3) and stores parsed output alongside the raw message.
5. Message appears in the operator's order intake queue (Section 4.3).

**The system must never silently discard a received message.** All messages, regardless of content, match status, or active week status, must be stored and surfaced to the operator.

### 6.3 Rule-Based Parser Specification

The parser operates on text message bodies only. Audio messages, images, and other media types are flagged for manual entry — the parser is not invoked for them.

**Parsing algorithm:**

Step 1 — Segment the message. Split on newlines, commas, and semicolons. Each segment is treated as a candidate order line item.

Step 2 — Extract quantity. For each segment, scan for a numeric expression: integer, decimal, or common fraction. Fraction mappings: "1/2" or "half" to 0.5; "1/4" or "quarter" to 0.25. If no quantity is found, flag the segment as unmatched.

Step 3 — Extract unit. Scan for a unit token in the segment. Apply synonym normalisation from the table in Section 6.4. If no unit token is found, leave unit as unspecified — the operator selects on review.

Step 4 — Extract product name. The remaining tokens (after quantity and unit removed) form the raw product text. Apply the synonym and variant table to map raw text to a product in the current week's produce list. Match is case-insensitive. If a match is found, record the product ID. If no match is found, record the raw text as unmatched and flag for operator selection.

Step 5 — Assemble output. Return an array of parsed line items. Each item has: matched product ID (null if unmatched), raw product text, quantity (numeric, null if not found), canonical unit (null if not found), confidence flag (Matched / Partial / Unmatched).

**"Same as last week" handling:** Any segment containing "same as last week," "same," "usual," or recognisable Tamil equivalents is not parseable by a rule-based system. The entire message is flagged as Manual Required and the operator enters the order manually.

### 6.4 Synonym and Variant Mapping Table

Pre-seeded at deployment. Operator-extensible in system configuration post-MVP. All entries matched case-insensitively.

|Raw input token(s)|Maps to|
|-|-|
|cauli, cauliflow, gobi|Cauliflower|
|tom, tomato, thakkali|Tomato|
|potato, aloo, urulai|Potato|
|carrot, gajar|Carrot|
|beans, bean, payir|Beans|
|onion, vengayam|Onion|
|kg, kilo, kilos, kilogram|kg|
|gm, gms, gram, grams, g|100g|
|pcs, piece, pieces, nos, no, count|piece|
|bun, bund, bunch, bunches|bunch|
|1/2, half|0.5 (quantity)|
|1/4, quarter|0.25 (quantity)|

### 6.5 Parser Fallback Behaviour

|Message Type|System Behaviour|
|-|-|
|English text, recognisable items and quantities|Rule-based parse — Clean result|
|Mixed Tamil/English text|English tokens processed; unrecognised Tamil tokens flagged as Unmatched|
|Abbreviations in synonym table|Normalised and matched|
|Abbreviations not in synonym table|Flagged Unmatched with raw text shown|
|Voice note (audio)|Flagged: "Voice note — manual entry required"|
|Image|Flagged: "Image — manual entry required"|
|Zero parseable line items from text|Flagged: "Could not parse — manual entry required"|
|"Same as last week" or equivalent|Flagged: "Manual entry required — cannot parse repeat order"|

### 6.6 FCFS Timestamp

The FCFS timestamp for every customer order is the WhatsApp API receipt timestamp of the customer's original message — the moment the message arrived at the webhook. It is not the time the operator reviewed the message, not the time the operator approved the order, and not the server processing time. This timestamp is immutable once set. The operator cannot edit it.

\---

## 7\. Wallet and Payment Model

### 7.1 Wallet Rules

1. Every registered customer has exactly one wallet, denominated in INR.
2. Wallet balance initialises at zero on customer registration.
3. Wallet balance cannot be driven below zero by any automated system action. This constraint is enforced at the database level, not only in application logic.
4. The only partial exception to Rule 3 is the overdelivery debit edge case (Section 7.5): the system debits to zero and records the remainder as a Customer Due. The wallet itself never shows a negative value.
5. An order can only move to Confirmed status if the current wallet balance is greater than or equal to the total order value at the moment of confirmation.
6. Wallet debits for order confirmation occur at the time of confirmation — not at delivery, not at reconciliation.

### 7.2 Wallet Entry Types

|Entry Type|Direction|Triggered By|
|-|-|-|
|Top-up|Credit|Operator confirms customer advance payment|
|Order Debit|Debit|Operator confirms order|
|Order Debit Reversal|Credit|Operator cancels a Confirmed order|
|Price Difference Credit|Credit|Shortfall reconciliation — customer received less than ordered|
|Price Difference Debit|Debit|Overdelivery reconciliation — customer received more than ordered|
|Customer Due|Record only (not a wallet debit)|Overdelivery amount exceeds wallet balance — recorded as external due|
|Balance Payment|Credit|Operator records market day balance payment from customer|
|Manual Adjustment|Credit or Debit|Operator-initiated correction with mandatory reason note|

### 7.3 Top-Up Flow

1. Customer makes advance payment via UPI (sends screenshot to operator) or in cash.
2. Operator verifies payment manually — no automated UPI reconciliation in MVP.
3. Operator enters top-up: customer, amount, channel (Cash or UPI), optional reference note.
4. System credits wallet immediately. Ledger entry created.
5. If the customer has a Pending Payment order and the updated wallet balance now covers the order value, the system prompts the operator to confirm the order.

### 7.4 Order Confirmation and Debit

1. Operator approves an order from the intake queue or order detail screen.
2. System checks: wallet balance >= order value.

   * Yes: wallet debited by order value. Order status set to Confirmed. Ledger entry: Order Debit.
   * No: order set to Pending Payment. No debit. Shortfall amount displayed.
3. Wallet debit is reversed in full if the operator cancels a Confirmed order. Ledger entry: Order Debit Reversal.

### 7.5 Overdelivery Debit Edge Case

When the operator confirms a price difference for an overdelivery and the debit amount exceeds the customer's current wallet balance:

1. System debits the wallet to zero. Ledger entry: Price Difference Debit (amount = remaining wallet balance before debit).
2. System creates a Customer Due record: amount = total overdelivery charge minus amount debited from wallet. This is the amount owed by the customer that the wallet could not absorb.
3. Customer Due is visible in the weekly financial summary under "Outstanding Customer Dues."
4. The operator collects this amount from the customer manually at the next interaction.
5. When collected, the operator records it as a Top-up with a note referencing the Customer Due.

### 7.6 Pending Payment at Order Lock

Orders in Pending Payment status at the time the operator initiates order lock are a blocking condition. The system lists all unresolved Pending Payment orders and prevents the lock action. Resolution paths:

* Operator records the customer's payment → wallet top-up → system prompts order confirmation → order moves to Confirmed.
* Operator cancels the order → blocking condition cleared.

There is no post-lock confirmation path for Pending Payment orders.

### 7.7 Wallet Surplus

If a customer's wallet balance exceeds their order value after advance payment, the surplus remains as a positive balance. No automatic refund is issued. The surplus is available for future orders or reconciliation credits. The operator manages refund requests manually.

\---

## 8\. Inventory Model

### 8.1 Two Separate Inventory Pools

The system tracks two inventory pools per week. They are never merged or auto-allocated across each other.

|Source|Origin|Used For|
|-|-|-|
|Outstation Farmer Inventory|Produce ordered from and delivered by outstation farmers, including buffer quantities received|Registered customer pre-orders and walk-in sales|
|Local Farmer Inventory|Produce brought to market on market day by local farmers|Walk-in sales only|

When a local farmer and an outstation farmer supply the same item, the system treats them as two separate physical stock pools. Payment attribution to each farmer is handled independently.

### 8.2 Outstation Farmer Inventory

**Build:** Outstation inventory is built from farmer-level item assignments set in Orders Locked state. Each assignment records: item ID, farmer ID, week ID, preorder quantity, buffer quantity, outgoing (ordered) quantity.

**Delivered quantity:** Recorded by volunteer in Delivery state. This is the actual quantity received, which may differ from the outgoing quantity.

**Allocation to pre-orders:** When there is a shortfall, the system allocates delivered quantity to registered customer orders using the FCFS rule (Section 8.4).

**Available for walk-in sales:** Delivered quantity minus quantity allocated to registered customer pre-orders equals the quantity available for walk-in sales. This includes buffer quantities received and any overdelivery quantities received above the outgoing order. Walk-in sales deduct from this pool.

**Inventory warning:** If available outstation quantity reaches zero and the operator attempts a walk-in sale against this source, the system displays a warning. The operator can proceed (not a hard block).

### 8.3 Local Farmer Inventory

**Build:** Recorded on market day in the inbound recording step (Section 4.8.1). Each entry: local farmer ID, item ID, week ID, inbound quantity, unit type, price per unit.

**Available for walk-in sales only.** Local farmer produce is never allocated to registered customer pre-orders.

**Local-farmer-only items:** The operator can add items during inbound recording that are not on the weekly produce list. These carry a manually entered price and appear in the walk-in sales screen but not on the registered customer produce list.

**Deduction:** Each walk-in sale against local farmer inventory deducts from that specific farmer's sold quantity for that item. Sold quantity per farmer per item is the basis for local farmer payment calculation.

**Unsold quantity:** Inbound quantity minus sold quantity equals unsold quantity. Unsold produce is returned to the farmer — not recorded as an expense.

### 8.4 FCFS Shortfall Allocation

When delivered quantity for an item is less than total ordered quantity across all Confirmed customer orders:

1. System sorts all Confirmed orders containing the shortfall item by FCFS timestamp ascending (earliest = highest priority).
2. System allocates available delivered quantity from the top of the FCFS list downward. Each customer receives their full ordered quantity until available stock is exhausted.
3. The customer at the point of exhaustion receives the remaining available quantity. All customers ranked below that point receive zero for that item.
4. Allocations are rounded to two decimal places for weight items (kg, 100g) and to whole numbers for count items (piece, bunch).
5. Packing list quantities reflect FCFS-adjusted quantities, not originally ordered quantities.
6. Reconciliation credits for shortfall customers are calculated against FCFS-adjusted delivered quantities, not original ordered quantities.

### 8.5 Overdelivery

When delivered quantity exceeds the outgoing ordered quantity:

* The surplus is available as outstation inventory for walk-in sales.
* All registered customer orders are fulfilled in full.
* No price difference is triggered for pre-order customers — they receive exactly what they ordered.
* The overdelivery surplus flows to walk-in sales inventory and is priced at the weekly produce list price.

\---

## 9\. Reconciliation Model

### 9.1 Trigger

The operator opens reconciliation after market day is complete. System moves week to Reconciliation state.

### 9.2 Price Difference Calculation

On entering Reconciliation state, the system automatically calculates price differences for all order line items:

```
Difference qty = Delivered qty - Ordered qty
Monetary difference = Difference qty x Weekly price per unit
```

A positive monetary difference means the customer owes more (overdelivery). A negative monetary difference means the customer is owed a credit (shortfall). Items with zero difference do not appear in the reconciliation screen.

### 9.3 Delivered Quantity Correction Window

Before confirming any price differences, the operator can edit delivered quantity for any line item to correct volunteer entry errors. Editing recalculates the monetary difference in real time. This correction window closes once the operator begins confirming differences — corrections to already-confirmed items require a Manual Adjustment entry.

### 9.4 Wallet Adjustment on Confirmation

**Shortfall (delivered < ordered):**

* Customer paid (via wallet debit at order confirmation) for quantity they did not receive.
* System credits wallet: credit amount = |difference qty| × weekly price.
* Ledger entry type: Price Difference Credit.

**Overdelivery (delivered > ordered):**

* Customer received more than they paid for.
* System debits wallet: debit amount = difference qty × weekly price.
* If wallet balance >= debit amount: full debit applied. Ledger entry: Price Difference Debit.
* If wallet balance < debit amount: wallet debited to zero. Remainder recorded as Customer Due. (Section 7.5.)

### 9.5 Outstation Farmer Payment Calculation

```
Amount due per farmer = Sum of (Delivered qty per item x Weekly price per item)
```

Calculated on delivered quantity, not ordered quantity. If a farmer delivered less than ordered, they are paid for what they delivered.

Financial integrity note: customer shortfall credits and the corresponding reduction in farmer payment due to the same shortfall event appear as separate line items in the weekly summary — customer credits as wallet adjustments, reduced farmer payment as a lower expense. Both are correct and independently traceable. The system does not net them.

### 9.6 Local Farmer Payment Calculation

```
Amount due per local farmer = Sum of (Sold qty per item x Weekly price per item)
```

Sold quantity is the quantity deducted from that farmer's inbound record via walk-in sales, with any operator edits applied before payment recording.

### 9.7 Week Close Gate

Week close is blocked until:

1. Every flagged price difference line item has been confirmed.
2. Every outstation farmer with a delivery record for this week has a payment status set.
3. Every local farmer with an inbound record for this week has a payment record completed.

Force-close is not permitted. There is no override path.

\---

## 10\. Weekly Financial Summary

### 10.1 Generation

The weekly financial summary is generated automatically when the operator closes the week. It is a calculated, read-only document. The operator cannot edit it. Any discrepancy between the system closing balance and the operator's physical cash count must be resolved by correcting upstream entries — not by overriding the summary.

### 10.2 Summary Structure

All monetary figures are presented split by payment channel: Cash and Bank (UPI) separately, plus a combined total for each line.

|Line|Description|Nature|
|-|-|-|
|Opening Balance|Closing balance from the previous week (Cash + Bank). For the first week, manually entered by operator at go-live.|Carried forward|
|Preorder Receipts|Total wallet top-ups received this week from registered customers (advance payments).|Cash inflow|
|Market Day Receipts|Total balance payments received from registered customers on market day.|Cash inflow|
|Walk-in Sales Receipts|Total amount collected from walk-in sales across both inventory sources.|Cash inflow|
|Wallet Adjustments — Credits|Total price difference credits applied to customer wallets this week (shortfall reconciliation).|Internal|
|Wallet Adjustments — Debits|Total price difference debits applied to customer wallets this week (overdelivery reconciliation).|Internal|
|Outstation Farmer Expenses — Paid|Total amounts actually paid to outstation farmers this week (excludes unpaid and outstanding partial liabilities).|Cash outflow|
|Local Farmer Expenses — Paid|Total amounts paid to local farmers this week.|Cash outflow|
|Outstanding Outstation Farmer Liabilities|Total unpaid and partial-unpaid amounts owed to outstation farmers, itemised per farmer. Carried forward.|Liability|
|Outstanding Customer Dues|Total Customer Due amounts recorded this week (overdelivery amounts exceeding wallet balance, not yet collected). Carried forward.|Receivable|
|Closing Balance|Calculated (see Section 10.3).|Calculated|

### 10.3 Closing Balance Formula

```
Closing Balance (Cash) =
    Opening Balance (Cash)
  + Preorder Receipts (Cash)
  + Market Day Receipts (Cash)
  + Walk-in Sales Receipts (Cash)
  - Outstation Farmer Expenses Paid (Cash)
  - Local Farmer Expenses Paid (Cash)

Closing Balance (Bank) =
    Opening Balance (Bank)
  + Preorder Receipts (Bank/UPI)
  + Market Day Receipts (Bank/UPI)
  + Walk-in Sales Receipts (Bank/UPI)
  - Outstation Farmer Expenses Paid (Bank/UPI)
  - Local Farmer Expenses Paid (Bank/UPI)

Closing Balance (Total) = Closing Balance (Cash) + Closing Balance (Bank)
```

Wallet adjustments (credits and debits) are informational line items. They do not affect the closing balance directly — they represent internal ledger adjustments to what customers owe or are owed, not physical cash or bank movements.

### 10.4 Carry-Forward Items

* Closing balance (Cash and Bank) becomes the next week's opening balance.
* Outstanding outstation farmer liabilities are visible in the next week's summary as prior-week liabilities.
* Outstanding customer dues are visible in the next week's summary as amounts to be collected.

Neither outstanding liabilities nor customer dues are automatically resolved. The operator follows up manually and records collection when received.

### 10.5 First Week Opening Balance

For the first market week on the new system, the operator manually enters the opening balance (Cash and Bank separately) based on actual cash in hand and bank balance at go-live. This entry is made at system setup before the first week is closed.

\---

## 11\. Data Model

### 11.1 Entities and Key Fields

#### Farmer

|Field|Type|Notes|
|-|-|-|
|farmer\_id|UUID|Primary key|
|name|String|Full name|
|phone|String|Unique. WhatsApp number with country code|
|location|String|Village or area|
|farmer\_type|Enum|outstation / local|
|active|Boolean|Soft delete|
|created\_at|Timestamp||

#### Customer

|Field|Type|Notes|
|-|-|-|
|customer\_id|UUID|Primary key|
|name|String|Full name|
|phone|String|Unique. Used for WhatsApp message matching|
|active|Boolean|Soft delete|
|wallet\_balance|Integer|Stored in paise. Must be >= 0 at all times|
|created\_at|Timestamp||

#### ProductCatalogue

|Field|Type|Notes|
|-|-|-|
|product\_id|UUID|Primary key|
|name\_en|String|English name|
|name\_ta|String|Tamil name (optional)|
|default\_unit|Enum|kg / piece / bunch / 100g|
|active|Boolean|Soft delete|

#### MarketWeek

|Field|Type|Notes|
|-|-|-|
|week\_id|UUID|Primary key|
|market\_date|Date|Unique|
|state|Enum|setup / open / locked / delivery / market\_day / reconciliation / closed|
|opening\_balance\_cash|Integer|In paise|
|opening\_balance\_bank|Integer|In paise|
|created\_at|Timestamp||
|closed\_at|Timestamp|Null until closed|

#### WeeklyProduceItem

|Field|Type|Notes|
|-|-|-|
|produce\_item\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|product\_id|UUID|FK to ProductCatalogue|
|unit|Enum|kg / piece / bunch / 100g|
|price\_per\_unit|Integer|In paise|
|display\_order|Integer|Operator-set|

#### CustomerOrder

|Field|Type|Notes|
|-|-|-|
|order\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|customer\_id|UUID|FK to Customer|
|status|Enum|pending\_payment / confirmed / cancelled / packed / dispatched / delivered|
|fcfs\_timestamp|Timestamp|WhatsApp API receipt time. Immutable|
|order\_value|Integer|In paise. Recalculated on line item edits|
|wallet\_debited|Integer|Amount debited at confirmation|
|balance\_due|Integer|Amount owed beyond wallet debit. Default 0|
|balance\_cleared|Boolean|True when balance payment fully received|
|created\_at|Timestamp|Time operator acted on the message|
|notes|String|Optional operator comment|

#### OrderLineItem

|Field|Type|Notes|
|-|-|-|
|line\_item\_id|UUID|Primary key|
|order\_id|UUID|FK to CustomerOrder|
|product\_id|UUID|FK to ProductCatalogue|
|ordered\_qty|Decimal|Quantity at order confirmation|
|delivered\_qty|Decimal|FCFS-adjusted quantity packed and delivered. Set in Delivery state|
|unit|Enum|kg / piece / bunch / 100g|
|price\_per\_unit|Integer|Weekly price at order confirmation, in paise|
|line\_value|Integer|ordered\_qty x price\_per\_unit, in paise|
|difference\_confirmed|Boolean|True when operator confirmed reconciliation for this item|

#### WalletTransaction

|Field|Type|Notes|
|-|-|-|
|txn\_id|UUID|Primary key|
|customer\_id|UUID|FK to Customer|
|week\_id|UUID|FK to MarketWeek (nullable for cross-week adjustments)|
|type|Enum|top\_up / order\_debit / order\_debit\_reversal / price\_diff\_credit / price\_diff\_debit / customer\_due / balance\_payment / manual\_adjustment|
|amount|Integer|Always positive, in paise. Direction implied by type|
|channel|Enum|cash / upi / system|
|reference\_note|String|Optional. UPI ref, adjustment reason, etc.|
|created\_at|Timestamp||
|running\_balance|Integer|Wallet balance after this transaction, in paise|

#### InboundMessage

|Field|Type|Notes|
|-|-|-|
|message\_id|String|WhatsApp API message ID (unique)|
|week\_id|UUID|FK to MarketWeek. Nullable if no active week|
|sender\_phone|String|Raw sender phone from API payload|
|customer\_id|UUID|FK to Customer. Nullable if unmatched|
|body|String|Raw message text. Null for audio/image|
|media\_type|Enum|text / audio / image / other|
|fcfs\_timestamp|Timestamp|WhatsApp API receipt time. Immutable|
|parse\_status|Enum|clean / partial / manual\_required / voice\_note / image / no\_active\_week|
|parsed\_items|JSON|Array of parsed line items from rule-based parser|
|queue\_status|Enum|pending / approved / rejected|
|operator\_notes|String|Optional|
|processed\_at|Timestamp|Null while pending|

#### FarmerOrderAssignment

|Field|Type|Notes|
|-|-|-|
|assignment\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|farmer\_id|UUID|FK to Farmer (outstation only)|
|product\_id|UUID|FK to ProductCatalogue|
|preorder\_qty|Decimal|Total confirmed customer preorder qty for this item|
|buffer\_pct|Decimal|Buffer percentage set by operator|
|buffer\_qty|Decimal|Calculated: preorder\_qty x buffer\_pct|
|outgoing\_qty|Decimal|Calculated: preorder\_qty + buffer\_qty|
|delivered\_qty|Decimal|Actual quantity received. Set in Delivery state|

#### LocalFarmerInbound

|Field|Type|Notes|
|-|-|-|
|inbound\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|farmer\_id|UUID|FK to Farmer (local only)|
|product\_id|UUID|FK to ProductCatalogue. Nullable for local-only items|
|item\_name|String|Used when product not in catalogue|
|inbound\_qty|Decimal|Quantity brought to market|
|sold\_qty|Decimal|Quantity sold via walk-in sales. Operator-editable before payment|
|unit|Enum|kg / piece / bunch / 100g|
|price\_per\_unit|Integer|In paise. From produce list or manually entered|

#### WalkInSale

|Field|Type|Notes|
|-|-|-|
|sale\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|product\_id|UUID|FK to ProductCatalogue. Nullable for local-only items|
|inventory\_source|Enum|outstation / local\_farmer|
|farmer\_id|UUID|FK to Farmer. Populated for local\_farmer source|
|qty\_sold|Decimal||
|amount\_collected|Integer|In paise|
|channel|Enum|cash / upi|
|customer\_id|UUID|FK to Customer. Nullable for anonymous / loosely registered|
|loose\_customer\_name|String|For loosely registered not in Customer table|
|loose\_customer\_phone|String|For loosely registered not in Customer table|
|created\_at|Timestamp||

#### FarmerPayment

|Field|Type|Notes|
|-|-|-|
|payment\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek|
|farmer\_id|UUID|FK to Farmer (outstation only)|
|amount\_due|Integer|Calculated: sum of (delivered\_qty x price\_per\_unit), in paise|
|status|Enum|unpaid / partial / paid|
|amount\_paid|Integer|0 if unpaid. In paise|
|outstanding|Integer|Calculated: amount\_due - amount\_paid|
|channel|Enum|cash / upi. Nullable if unpaid|
|recorded\_at|Timestamp||

#### WeeklySummary

|Field|Type|Notes|
|-|-|-|
|summary\_id|UUID|Primary key|
|week\_id|UUID|FK to MarketWeek. Unique|
|opening\_balance\_cash|Integer|In paise|
|opening\_balance\_bank|Integer|In paise|
|preorder\_receipts\_cash|Integer||
|preorder\_receipts\_bank|Integer||
|market\_day\_receipts\_cash|Integer||
|market\_day\_receipts\_bank|Integer||
|walkin\_receipts\_cash|Integer||
|walkin\_receipts\_bank|Integer||
|wallet\_adjustments\_credits|Integer|Total price difference credits|
|wallet\_adjustments\_debits|Integer|Total price difference debits|
|outstation\_farmer\_paid\_cash|Integer||
|outstation\_farmer\_paid\_bank|Integer||
|local\_farmer\_paid\_cash|Integer||
|local\_farmer\_paid\_bank|Integer||
|outstanding\_farmer\_liabilities|Integer|Unpaid + partial outstanding across all outstation farmers|
|outstanding\_customer\_dues|Integer|Total Customer Due amounts not yet collected|
|closing\_balance\_cash|Integer|Calculated|
|closing\_balance\_bank|Integer|Calculated|
|generated\_at|Timestamp||

### 11.2 Key Relationships

```
MarketWeek
  |-- WeeklyProduceItem (1:many) --> ProductCatalogue
  |-- CustomerOrder (1:many) --> Customer
  |     |-- OrderLineItem (1:many) --> ProductCatalogue
  |-- InboundMessage (1:many) --> Customer
  |-- FarmerOrderAssignment (1:many) --> Farmer (outstation)
  |-- LocalFarmerInbound (1:many) --> Farmer (local)
  |-- WalkInSale (1:many)
  |-- FarmerPayment (1:many) --> Farmer (outstation)
  |-- WeeklySummary (1:1)

Customer
  |-- CustomerOrder (1:many)
  |-- WalletTransaction (1:many)
```

### 11.3 Database Notes

* NoSQL document-oriented database (e.g., Firestore or MongoDB Atlas free tier).
* Each entity above maps to a collection. OrderLineItem may be nested as a subcollection within CustomerOrder. ParsedItems may be nested as a JSON array within InboundMessage.
* All monetary fields stored as integers in paise (1 INR = 100 paise) to eliminate floating-point arithmetic errors. Displayed as INR (divided by 100) in the UI.
* All records are immutable once written. Corrections are made by new entries (reversal or adjustment entries), not by overwriting existing records.

\---

## 12\. Non-Functional Requirements

|Requirement|Specification|
|-|-|
|**Language**|Tamil and English. All UI labels, button text, system messages, error messages, and generated WhatsApp message text are provided in both languages. Language is a static, operator-selectable setting at the account level — not dynamic per user. No runtime translation.|
|**Device — Operator**|Laptop or tablet running a modern browser (Chrome, Firefox, Safari — current and prior major version). Minimum viewport 768px wide. No native app required.|
|**Device — Volunteer**|Low-end Android smartphone (Android 8 and above). Mobile-optimised PWA. Touch targets minimum 44px. No pinch-zoom required for core actions.|
|**Connectivity — Volunteer**|Volunteer PWA must be functional on 2G/3G connections. Each screen must load in under 8 seconds on a 3G connection (\~1.5 Mbps). Service worker caches the app shell and form state for offline tolerance during delivery quantity entry.|
|**Connectivity — Operator**|Operator dashboard assumes stable Wi-Fi or 4G. No offline mode required for the operator.|
|**Performance**|Page transitions within the operator PWA must complete in under 2 seconds on standard broadband. Weekly financial summary generation must complete in under 5 seconds.|
|**Cost**|All infrastructure — database, webhook endpoint, hosting, authentication — must be deployable on free-tier services. No paid SaaS subscriptions in MVP. Serverless functions for the webhook endpoint. Static hosting (e.g., Vercel or Netlify free tier) for the PWA.|
|**Authentication**|Operator and volunteer authentication required before accessing the system. Minimum: email/password or magic link authentication. No customer or farmer authentication. Operator and volunteer accounts are created by the system administrator.|
|**Data Retention**|All week data, order records, wallet ledgers, and financial summaries are retained indefinitely. No automated data purge.|
|**Audit Trail**|All state transitions, wallet entries, and payment records are timestamped and attributed to the operator who performed the action. Records are immutable — corrections are new entries, not overwrites.|
|**Payment Processing**|Manual confirmation only. No payment gateway integration. No automated UPI reconciliation.|
|**Monetary Arithmetic**|All monetary calculations performed in integer paise to avoid floating-point errors. Displayed as INR with two decimal places in the UI.|

\---

## 13\. Out of Scope — MVP

The following are explicitly excluded from the MVP. Their absence is intentional and does not represent a gap.

|Item|Post-MVP Path|
|-|-|
|Farmer-facing interface (outstation or local)|Post-MVP: farmer PWA for direct produce list submission|
|Customer-facing PWA or ordering interface|Post-MVP: minimal read-only view for order status and wallet balance. Trigger: customer count exceeds 80–100 or relay effort becomes a measurable burden on the operator|
|WhatsApp bot auto-reply for customer queries (balance, order status)|Post-MVP: enabled once WhatsApp Business API is stable from B-Assisted intake|
|Automated UPI payment reconciliation|Post-MVP: UPI webhook or deep-link integration|
|Voice-to-text for customer order messages|Post-MVP: deferred due to accuracy risk with Tamil/English mixed speech input|
|OCR for image-based customer orders|Post-MVP|
|Dynamic translation (Tamil to English or English to Tamil)|Post-MVP: static pre-translated labels only in MVP|
|AI-based pricing, demand prediction, or recommendations|Post-MVP|
|Advanced analytics and multi-week trend reporting|Post-MVP|
|Loyalty or credit programmes|Post-MVP|
|Walk-in customer upgrade path (loosely registered to fully registered)|Handled as fresh registration in MVP|
|Multiple operator roles or permission levels|Post-MVP|
|Native mobile app (iOS or Android)|Post-MVP: PWA is sufficient for MVP|
|Product images|Post-MVP|
|Farmer capacity or reliability notes|Post-MVP: currently knowledge held by the operator only|
|Pre-delivery farmer quantity revision flow|Post-MVP: quantity shortfalls surface at delivery in MVP|
|"Copy last week's order" shortcut|Post-MVP: high value if repeat order frequency is confirmed to be high|
|System-generated WhatsApp message sending|Post-MVP: operator copies and pastes generated text in MVP|

\---

## 14\. Open Items and Post-MVP Roadmap

### 14.1 Resolution of PRD Open Items

All 12 PRD open items from interactions\_flows.md have been resolved. No items remain that block development.

|#|Item|Resolution|Section|
|-|-|-|-|
|P1|Price edit after publishing — reprice or revert?|Orders with wallet shortfall revert to Pending Payment|3.4|
|P2|Can operator edit a confirmed order pre-lock?|Yes. Wallet adjusted accordingly|4.4.2|
|P3|Pending Payment orders at lock — post-lock confirm path?|No post-lock path. Operator records payment or cancels before lock|7.6|
|P4|Overdelivery debit exceeding wallet balance|Debit to zero. Remainder recorded as Customer Due|7.5|
|P5|Can operator edit delivered qty in reconciliation?|Yes, before confirming any differences|4.9.1|
|P6|Overdelivered outstation produce available for walk-in?|Yes, included in outstation inventory available for walk-in sales|8.5|
|P7|Uncollected orders — system behaviour?|Marked as Delivered with optional operator comment|4.8.4|
|P8|Multi-source walk-in basket — single or separate entries?|Separate entries, one per inventory source|4.8.2|
|P9|Volunteer write access to walk-in sales?|No. Volunteer is packing and dispatch only|2.3|
|P10|Can operator edit local farmer sold qty before payment?|Yes, in Reconciliation state before recording payment|4.9.3|
|P11|Force-close with unresolved reconciliation items?|Not permitted. No override|4.10|
|P12|First week opening balance — how entered?|Manually entered by operator at go-live|10.5|

### 14.2 Consistency Resolutions Applied

Seven inconsistencies were identified across source documents before PRD production. All resolved as follows.

|#|Inconsistency|Resolution Applied|
|-|-|-|
|1|Local farmer carry-forward vs. same-week-only rule|Same-week only. No carry-forward. decisions.md governs|
|2|Wallet debit at zero — prevent vs. partial debit|Debit to zero, remainder as Customer Due. Wallet never goes negative|
|3|Price edit — silent reprice vs. revert to Pending Payment|Revert to Pending Payment. P1 resolution governs|
|4|Wallet top-up blocked in Reconciliation by process\_map gate|Top-up permitted in Reconciliation. Required for operational continuity|
|5|Uncollected order final status — Packed vs. Delivered|Marked as Delivered with comment. P7 resolution governs|
|6|Buffer granularity — per item vs. per farmer-item|Per item. Farmer splitting is a separate assignment step|
|7|Volunteer visibility of balance due|Read-only balance due field on volunteer dispatch screen|

### 14.3 Post-MVP Roadmap

**High priority — first phase after MVP stabilises:**

* WhatsApp bot auto-reply for customer balance and order status queries (enabled once B-Assisted intake is stable)
* "Copy last week's order" shortcut in the intake queue (assess frequency of repeat-order messages after go-live)
* Farmer-level notes for capacity, reliability, and preferred items (addresses split-decision knowledge gap)
* Variance alert on week close: flag when system closing balance differs from a manually entered physical cash count by more than a configurable threshold

**Medium priority:**

* Customer-facing minimal read-only PWA for order status and wallet balance (trigger: customer count exceeds 80–100)
* Automated UPI reconciliation via webhook
* Extension of B-Assisted parsing approach to outstation farmer availability messages
* Post-lock Pending Payment confirmation path to reduce operator pressure at the lock gate

**Lower priority:**

* Farmer-facing PWA for direct produce list submission
* Voice-to-text for Tamil/English mixed order messages (requires accuracy validation)
* Advanced multi-week analytics and trend reporting
* Customer wallet top-up via UPI deep-link
* Walk-in customer formal upgrade path to full registration

\---

*Document prepared for internal use. Do not distribute.*  
*Grounded in: context\_v4.md (v4.0) · decisions.md (v1.0) · process\_map.md (v1.0) · interactions\_flows.md (v1.1)*  
*All 12 PRD open items resolved. All 7 pre-PRD consistency issues resolved. No open items remain.*

