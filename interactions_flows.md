# B2C Farmer Marketplace – Interaction Flows

**Version:** 1.0
**Status:** Draft – Awaiting Review on Flows 1–5
**Last Updated:** April 2026
**Depends On:** context\_v4.md, decisions.md, process\_map.md

\---

## Purpose

This document describes the to-be interaction flows for the new system. It covers all 13 flows across the weekly market cycle. Flows marked \[HIGH] have the greatest impact on the PRD data model, state machine, and financial logic — these must be reviewed and confirmed before PRD work begins.

Every unconfirmed assumption is marked **\[ASSUMED]**.
Every operational gap, contradiction, or risk is marked **\[CHALLENGE]**.

\---

## Flow Index

|#|Flow|Priority|State|
|-|-|-|-|
|1|Outstation farmer sends availability → Operator enters produce list|HIGH|Setup|
|2|Operator publishes list → Registered customer places order|HIGH|Open for Orders|
|3|Customer makes advance payment → Operator confirms + wallet top-up|HIGH|Open for Orders|
|4|Operator aggregates orders + sets buffer → Splits across farmers → Sends orders|HIGH|Orders Locked|
|5|Price difference identified → Reconciliation → Wallet adjustment|HIGH|Reconciliation|
|6|Produce arrives → Volunteer confirms delivery quantities → Packing|MED|Delivery|
|7|Registered customer collects order on market day|MED|Market Day|
|8|Local farmer arrives at market → Operator records inbound items|MED|Market Day|
|9|Walk-in sale — anonymous or loosely registered customer|MED|Market Day|
|10|Walk-in sale against local farmer inventory|MED|Market Day|
|11|Local farmer payment at end of market day|MED|Reconciliation|
|12|Outstation farmer payment → Operator marks paid|MED|Reconciliation|
|13|Week close → Weekly financial summary generated|LOW|Reconciliation → Closed|

\---

\---

## Flow 1 — Outstation Farmer Sends Availability → Operator Enters Produce List

**Trigger:** Outstation farmer sends weekly availability message to operator via WhatsApp, typically on Friday.
**Actors:** Outstation Farmer, Operator
**System State Required:** Setup
**Channel:** WhatsApp (farmer → operator), PWA-OP (operator → system)

### Steps

1. Outstation Farmer sends availability list to operator via WhatsApp. Message may be free-form text in English or Tamil, a voice note, or a combination. Format varies by farmer. \[WA]
2. Operator reads all incoming farmer messages and consolidates the full available produce list mentally or on paper before entering into the system. \[WA / EXT]
3. Operator creates a new market week in the PWA if one does not already exist for the upcoming market date. \[PWA-OP]
4. System creates week record in Setup state. All fields empty. \[SYSTEM]
5. Operator adds each item to the weekly produce list: item name, unit type (kg / piece / bunch / 100g), price per unit. One entry per item. \[PWA-OP]
6. System stores each item against the week. Validates that unit type is one of the permitted types. \[SYSTEM]
7. Operator reviews the full produce list for completeness and accuracy against the farmer messages. \[PWA-OP]
8. Operator edits or removes items as needed until the list is correct. \[PWA-OP]
9. Operator publishes the week. \[PWA-OP]
10. System moves week to Open for Orders state. Produce list is now visible as the basis for customer orders. Item deletion is no longer permitted; price edits remain permitted. \[SYSTEM]
11. System generates a formatted produce list (text or image) ready for operator to copy and share. \[SYSTEM]
12. Operator copies the formatted list and sends it to the registered customer WhatsApp group. \[WA]

### End State

Week is in Open for Orders state. Weekly produce list is complete with item names, unit types, and prices. All registered customers have received the list via WhatsApp.

### Variants

**Multiple farmers supplying the same item:** Operator enters the item once on the produce list at a single price. The system does not track which farmer is supplying which item at this stage — that attribution is handled in Flow 4 when outstation farmer orders are split. \[ASSUMED: operator mentally tracks which farmer covers which item before entering the list]

**Farmer sends voice note:** Operator listens to voice note and manually enters items. No speech-to-text in MVP. Voice notes are not ingested by the system.

**Farmer sends partial list with amendments later:** Operator waits for final confirmation or enters a provisional list and edits before publishing. System allows edits in Setup state without restriction.

**Price correction after publishing:** Operator edits item price after week is published (Open for Orders state). Price edits are permitted in Open for Orders state.

When a price edit causes a confirmed order's value to exceed the customer's wallet balance, the system flags the affected orders, reverts them to Pending Payment, and the operator is required to inform the customer and collect the shortfall before the order can be re-confirmed.



### Assumptions

* \[ASSUMED-confirmed] A single market week maps to a single market date. The operator creates one week record per market day.
* \[ASSUMED-confirmed] The operator is the sole person entering the produce list. No concurrent multi-operator entry in MVP.
* \[ASSUMED-confirmed] Items on the produce list are drawn from a pre-existing product catalogue maintained by the operator. New items not in the catalogue can be added inline during list entry.

### Challenges

* \[CHALLENGE-Future scope] Farmer message formats vary significantly week to week and across farmers. There is no system assistance for parsing farmer messages in MVP (unlike customer orders, which have the B-Assisted parser). The operator manually reads and transcribes. If farmer message volume grows, this becomes a bottleneck. Post-MVP: extend the B-Assisted parsing approach to farmer availability messages.
* \[CHALLENGE-Fixed] If a price is edited after orders have already been entered, Price edits are permitted in Open for Orders state; orders already entered at the old price are updated with the latest price. Any negative wallet balance because of this is  during market day settlement. This is a PRD decision that must be made explicit.

\---

\---

## Flow 2 — Operator Publishes List → Registered Customer Places Order

**Trigger:** Registered customer sends an order message to the operator via WhatsApp after receiving the produce list.
**Actors:** Registered Customer, Operator
**System State Required:** Open for Orders
**Channel:** WhatsApp (customer → operator), PWA-OP (operator confirms parsed order)

### Steps

1. Registered Customer receives the weekly produce list via WhatsApp group. \[WA]
2. Registered Customer sends order message to operator via WhatsApp. Free-form text in English or Tamil. \[WA]
3. WhatsApp Business API webhook receives the message. System records the message receipt timestamp — this is the FCFS anchor for this customer's order. \[SYSTEM]
4. System parses the message: attempts to extract product name, quantity, and unit for each line item by matching against the current week's produce list. \[SYSTEM]
5. Operator opens the order intake queue in the PWA. Sees a list of incoming messages, each showing: customer name (matched by phone number), original message text, and parsed order preview. \[PWA-OP]
6. Operator reviews the parsed order for the customer. Checks each line item: product name, quantity, unit. \[PWA-OP]
7. If parsing is correct: Operator approves the order in one action. \[PWA-OP]
8. If parsing has errors: Operator edits the incorrect line items (selects correct product from produce list, adjusts quantity or unit) and then approves. \[PWA-OP]
9. If the message is a voice note or is entirely unparseable: System flags it for manual entry. Operator manually selects products and enters quantities. \[PWA-OP]
10. System checks wallet balance against order value on approval. \[SYSTEM]
11. If wallet balance ≥ order value: System confirms order, debits wallet by order value, records order under customer profile with FCFS timestamp from step 3, sets order status to Confirmed. Wallet ledger updated with order debit entry. \[SYSTEM]
12. If wallet balance < order value: System holds order in Pending Payment state. Operator is shown the shortfall amount. Order is not confirmed until wallet is topped up (see Flow 3). \[SYSTEM]
13. Operator informs customer of order confirmation or pending payment status via WhatsApp. \[WA]

### End State

Customer order is stored in the system in Confirmed status. Wallet has been debited by the order value. FCFS timestamp is set to message receipt time. Order is visible in the aggregated order summary.

### Variants

**Customer requests amendment after order is confirmed but before lock:** \[Operator can edit a confirmed order before the week is locked — this needs PRD confirmation. Wallet is adjusted to reflect amended order value.]

**Customer requests amendment after orders are locked:** Operator informs customer that the order is closed. Any additions are treated as walk-in purchases on market day. No system change.

**Customer message contains an item not on the produce list:** Parser flags the unrecognised item. Operator informs customer the item is not available this week and removes it from the order before confirming.

**Customer sends multiple messages for the same order:** Operator consolidates into a single order entry. System does not auto-merge multiple messages from the same customer.]

**New customer not yet registered:** Operator registers the customer first (name + phone) before entering the order. Wallet starts at zero — order will be in Pending Payment until advance is received.

### Assumptions

* \[ASSUMED-Confirmed] Phone number is the unique identifier for matching incoming WhatsApp messages to registered customer profiles.
* \[ASSUMED-Confirmed] Operator confirms orders one at a time in sequence, not in bulk.
* \[ASSUMED-confirmed] The produce list is not shared with unregistered customers — only registered customers receive it via the WhatsApp group.

### Challenges

* \[CHALLENGE-confirmed] Parser accuracy will be low early on, especially for Tamil text, abbreviations, and non-standard quantity expressions (e.g., "half", "quarter", "2 and a half"). Operator edit frequency will be high until the parser's synonym/variant table is tuned. Design the edit UI for speed — minimum taps per correction.
* \[CHALLENGE-confirmed] "Same as last week" orders — a common pattern among regular customers — are not parseable by a rule-based system. These will always require manual operator entry. Frequency should be monitored; if common, a "copy last week's order" shortcut becomes a high-value PRD feature.
* \[CHALLENGE-confirmed] FCFS timestamp is set at message receipt, not at operator confirmation. If the operator processes messages in a non-chronological order, the packing list priority will not match the order in which the operator confirmed them. Volunteers must rely on the system's FCFS sort, not on the order the operator worked through the queue.

\---

\---

## Flow 3 — Customer Makes Advance Payment → Operator Confirms + Wallet Top-Up

**Trigger:** Registered customer makes an advance payment (UPI or cash) and notifies the operator.
**Actors:** Registered Customer, Operator
**System State Required:** Open for Orders (also permitted in Orders Locked and Delivery states for top-ups)
**Channel:** WhatsApp / physical (customer → operator), PWA-OP (operator → system)

### Steps

1. Registered Customer transfers advance payment via UPI and sends screenshot to operator via WhatsApp, or pays cash directly to operator. \[WA / EXT]
2. Operator receives payment notification or cash. \[WA / EXT]
3. Operator opens the customer's wallet in the PWA. \[PWA-OP]
4. Operator enters the top-up: amount and payment channel (cash or UPI). \[PWA-OP]
5. System credits the wallet. Wallet ledger updated with top-up entry showing amount, channel, and timestamp. \[SYSTEM]
6. System checks if any orders for this customer are in Pending Payment state. \[SYSTEM]
7. If the topped-up wallet balance now covers a Pending Payment order: System notifies operator. Operator reviews and confirms the order. System debits wallet by order value. Order status moves to Confirmed. FCFS timestamp remains the original message receipt time from Flow 2 step 3. \[SYSTEM + PWA-OP]
8. If wallet balance is still insufficient after top-up: Order remains in Pending Payment. Operator informs customer of remaining shortfall via WhatsApp. \[PWA-OP + WA]
9. Operator confirms receipt of payment to customer via WhatsApp. \[WA]

### End State

Customer wallet reflects the top-up credit and, if order was confirmed, the order debit. Order is in Confirmed status if wallet covered the full order value. FCFS timestamp is unchanged — it reflects when the customer originally ordered, not when they paid.

### Variants

**Customer pays cash on the spot (no WhatsApp notification):** Operator records the top-up immediately at point of cash receipt. Same flow from step 3.

**Customer overpays relative to order value:** Wallet retains the surplus as a positive balance. No refund is issued in MVP — surplus carries forward and is available for future orders or reconciliation credits. \[ASSUMED: surplus wallet balance is not automatically refunded; operator manages this manually if customer requests it]

**Top-up received after orders are locked:** Top-up is still recorded and wallet credited. However, if the order is in Pending Payment after lock, the operator manually calls the customer and records payment or deletes the order on non-payment: confirm the late order (if the system permits post-lock order confirmation) or inform the customer that the order cannot be fulfilled this week. \[CHALLENGE: see below]

**Multiple payments for a single order (customer pays in instalments):** Each payment is recorded as a separate top-up. Order confirms automatically when cumulative wallet balance reaches order value.

### Assumptions

* \[ASSUMED--confirmed] There is no direct UPI reconciliation — operator manually verifies each UPI screenshot against the amount before entering the top-up. System trusts operator entry.
* \[ASSUMED-confirmed] Wallet balance can go to zero but not below zero. The system must prevent any debit that would result in a negative balance.

### Challenges

* \[CHALLENGE-confirmed] Pending Payment orders that remain unresolved at order lock: the process map blocks order confirmation after lock (state gate). Customer has to pay before  order lock  — The operator manually calls the customer and records payment or deletes the order on non payment. This will be a manual override considered for the PRD.
* \[CHALLENGE-confirmed] UPI screenshot verification is entirely manual and trust-based. There is no fraud protection in MVP. Risk is low at current scale (\~50 customers, known community) but should be noted.

\---

\---

## Flow 4 — Operator Aggregates Orders + Sets Buffer → Splits Across Farmers → Sends Orders

**Trigger:** Operator locks orders and moves to Orders Locked state.
**Actors:** Operator, Outstation Farmers
**System State Required:** Orders Locked
**Channel:** PWA-OP (operator), WhatsApp (farmer communication)

### Steps

1. Operator locks orders in the PWA. System moves week to Orders Locked state. No new orders accepted. \[PWA-OP → SYSTEM]
2. Operator opens the outstation farmer order management screen. \[PWA-OP]
3. System displays aggregated order summary: per item — item name, unit type, total preorder quantity across all confirmed customer orders. \[SYSTEM]
4. Operator reviews the aggregated quantities per item. \[PWA-OP]
5. Operator sets buffer percentage per item (10–30%). Buffer may vary by item and by farmer. \[PWA-OP]
6. System calculates outgoing quantity per item: Preorder Qty + Buffer Qty. Displays both figures. \[SYSTEM]
7. Operator reviews the consolidated view and manually assigns each item quantity to the relevant outstation farmer(s). If multiple farmers supply the same item, operator decides the split and enters quantities per farmer. \[PWA-OP]
8. System stores the farmer-level assignment per item. Displays per-farmer order summary: farmer name, items assigned, preorder qty, buffer qty, outgoing qty per item. \[SYSTEM]
9. Operator reviews each farmer's order summary for accuracy. \[PWA-OP]
10. Operator exports or copies each farmer's order summary from the PWA. \[PWA-OP]
11. System generates per-farmer order text formatted for WhatsApp sharing. \[SYSTEM]
12. Operator sends each outstation farmer their consolidated order via WhatsApp individually. \[WA]
13. Outstation Farmer receives order and prepares produce for dispatch. \[WA / EXT]

### End State

All outstation farmer orders have been set with preorder quantities, buffer quantities, and outgoing quantities. Farmer-level item assignments are recorded in the system. Each outstation farmer has received their order via WhatsApp.

### Variants

**Single farmer supplies all items:** Operator assigns all items to one farmer. Farmer split step is trivial. Flow proceeds as above.

**One item supplied by multiple farmers:** Operator manually decides the quantity split (e.g., 10kg peas to Farmer A, 5kg peas to Farmer B). System records both assignments. Both farmers receive their respective quantities in their WhatsApp order.

**Operator adjusts buffer after initial entry:** Operator can revise buffer values before sending orders to farmers. System recalculates outgoing qty on each revision. \[ASSUMED: buffer adjustments are permitted any time in Orders Locked state before orders are sent]

### Assumptions

* \[ASSUMED-confirmed] The operator sends farmer orders manually via WhatsApp — the system generates the text but does not send it automatically. Operator copies and pastes into WhatsApp.
* \[ASSUMED-confirmed] Buffer is set per item, not as a single percentage across all items. Different items may have different buffers depending on demand uncertainty or farmer reliability.
* \[ASSUMED-confirmed] Once farmer orders are sent via WhatsApp, no system confirmation of farmer receipt exists. The operator manages this through direct WhatsApp conversation.

### Challenges

* \[CHALLENGE-confirmed] The manual split decision for same-item multi-farmer scenarios relies entirely on the operator's knowledge of which farmers are reliable, what their capacity is, and what they offered that week. This knowledge lives outside the system. If the operator team changes or grows, this knowledge is not captured anywhere. Post-MVP: add farmer-level capacity or reliability notes.
* \[CHALLENGE-confirmed] If a farmer confirms a different quantity than ordered (e.g., can only supply 8kg instead of 12kg), there is no system flow in MVP for the operator to record a pre-delivery quantity revision. This surfaces as a shortfall at delivery (Flow 6). The operator currently manages this via WhatsApp negotiation. This is an acceptable MVP gap but should be flagged for the PRD.

\---

\---

## Flow 5 — Price Difference Identified → Reconciliation → Wallet Adjustment

**Trigger:** Operator opens reconciliation after market day. System flags orders where delivered quantity differs from ordered quantity.
**Actors:** Operator, System
**System State Required:** Reconciliation
**Channel:** PWA-OP

### Steps

1. Operator opens reconciliation screen in the PWA. \[PWA-OP]
2. System identifies all order line items where delivered quantity (recorded by volunteer in Flow 6) differs from ordered quantity. Calculates monetary difference per line item: (delivered qty − ordered qty) × weekly price. \[SYSTEM]
3. System displays the flagged list: customer name, item, ordered qty, delivered qty, difference qty, price per unit, monetary difference (positive = customer owes more / negative = customer is owed a credit). \[SYSTEM]
4. Operator reviews each flagged line item. \[PWA-OP]
5. Operator confirms the difference for each line item. \[PWA-OP]
6. System applies the wallet adjustment:

   * If delivered qty < ordered qty (shortfall): system credits customer wallet by the overpayment amount (customer already paid for qty they did not receive).
   * If delivered qty > ordered qty (overdelivery): system debits customer wallet by the additional amount owed.
\[SYSTEM]
7. Wallet ledger updated with each adjustment entry: type (price difference credit or debit), item, amount, week reference. \[SYSTEM]
8. Operator reviews the adjusted wallet balances for all affected customers. \[PWA-OP]
9. Operator informs affected customers of wallet adjustments via WhatsApp where relevant. \[WA]

### End State

All price differences are resolved. Customer wallets reflect credits for shortfalls and debits for overdeliveries. Wallet ledgers have full entries for each adjustment. No unresolved flagged items remain.

### Variants

**No price differences this week:** Reconciliation screen shows no flagged items. Operator proceeds directly to farmer payment steps (Flows 11 and 12).

**Operator disputes a flagged difference:** Operator has the option to override the delivered quantity before confirming (e.g., volunteer recorded wrong quantity). \[ASSUMED: operator can edit delivered quantity in reconciliation before confirming the difference — this needs PRD confirmation]

**Overdelivery where customer wallet has insufficient balance for the debit:** System must debit the wallet even if it goes to zero — but cannot go negative. \[CHALLENGE: see below]



**Customer disputes an adjustment:** Handled outside the system via WhatsApp conversation between operator and customer. System records what the operator confirms — operator may issue a manual wallet credit if the dispute is resolved in the customer's favour.

### Assumptions

* \[ASSUMED] Delivered quantity per item is recorded at the item level (total delivered for that item), not per customer. The system pro-rates shortfalls across affected customers based on FCFS order. The FCFS-based allocation from Flow 6 determines which customers received full qty and which received reduced qty.
* \[ASSUMED] The operator confirms all price differences in a single reconciliation session. Partial reconciliation (confirming some differences but not others) is possible but the week cannot be closed until all flagged items are resolved.

### Challenges

* \[CHALLENGE] Overdelivery debits on low-wallet customers: if a customer's wallet balance is insufficient to cover an overdelivery debit, the system cannot go negative. The operator must collect the outstanding amount manually. This creates a dues balance that the weekly summary must capture and carry forward.  Solution:Debit wallet to zero, record the remainder as a customer due in the weekly summary, operator collects manually at next interaction.
* 
* \[CHALLENGE] If the volunteer records delivered quantity incorrectly (Flow 6), all downstream reconciliation calculations are wrong. There is no second verification step. Consider whether the operator should have a "review delivered quantities" step at the start of reconciliation before differences are calculated.

\---

\---

## Flow 6 — Produce Arrives → Volunteer Confirms Delivery Quantities → Packing

**Trigger:** Outstation farmer produce arrives at the collection point (typically Wednesday).
**Actors:** Volunteer, Operator
**System State Required:** Delivery
**Channel:** PWA-VOL (volunteer), PWA-OP (operator)

### Steps

1. Operator confirms produce has arrived in the PWA. System moves week to Delivery state. \[PWA-OP → SYSTEM]
2. Volunteer opens the PWA on mobile. Views the expected delivery list: item name, expected (outgoing) quantity per item as sent to each farmer. \[PWA-VOL]
3. Volunteer physically inspects the arriving produce and records actual delivered quantity per item in the PWA. \[PWA-VOL]
4. System records delivered qty per item. Calculates variance: delivered qty vs. expected qty. Flags shortfalls (delivered < expected) and overdelivery (delivered > expected) per item. \[SYSTEM]
5. For shortfall items: System applies FCFS rule — ranks affected customer orders by FCFS timestamp (message receipt time from Flow 2). Customers with earlier timestamps receive their full ordered quantity first. Customers at the bottom of the FCFS ranking receive reduced quantities or zero for the shortfall item. \[SYSTEM]
6. Volunteer (or operator) reviews the flagged shortfalls and the FCFS-adjusted packing list. \[PWA-VOL / PWA-OP]
7. Volunteer views the customer-specific packing list. List shows per customer: items to pack, quantities (adjusted for shortfall where applicable), and FCFS rank for shortfall items. \[PWA-VOL]
8. Volunteer physically packs each customer's order. \[EXT]
9. Volunteer marks each customer order as Packed in the PWA. \[PWA-VOL]

### End State

All delivered quantities are recorded. Shortfalls and overdeliveries are flagged in the system. All customer orders are marked as Packed with actual quantities that will be delivered. FCFS-adjusted quantities are the basis for reconciliation in Flow 5.

### Variants

**No shortfalls:** All items delivered at or above expected quantity. FCFS rule not applied. All customers receive full ordered quantities. Overdelivery quantities recorded but no customer adjustment needed at packing — overdelivery handled in reconciliation.

**Entire item missing:** Delivered qty is zero for an item. All customer orders for that item are marked as zero fulfilled. All affected customers receive full wallet credits in reconciliation.

**Partial delivery on multiple items simultaneously:** System handles each item independently. FCFS is applied based on the order seniority.

**Volunteer records incorrect quantity:** Operator can review and correct delivered quantities on the PWA-OP before reconciliation is opened. \[ASSUMED]

### Assumptions

* \[ASSUMED-confirmed] Delivered quantity is recorded per item in aggregate — not split by source farmer. If two farmers were assigned the same item, the volunteer records total received qty for that item, not per-farmer qty.
* \[ASSUMED-confirmed] Volunteer has reliable mobile data connectivity at the delivery location. If connectivity is poor, the volunteer records on paper and operator enters into the system.

### Challenges

* \[CHALLENGE-confirmed] FCFS allocation in cases of partial shortfall does not require the system to make item-level allocations per customer. If Customer A ordered 2kg peas and only 1.5kg total is available across all customers who ordered peas, the system must allocate 1.5kg to Customer A. The remaining is available for Customer B or others. The allocation logic must be clearly specified in the PRD — particularly whether partial quantities are rounded to the nearest acceptable unit (e.g., 0.1kg increments for weight items).
* \[CHALLENGE-confirmed] Overdelivery: extra produce arrives beyond what was ordered. The system records it. It is available for walk-in sales on market day. \[ASSUMED-confirmed: overdelivered outstation produce is available for walk-in sales; the operator records it as a walk-in sale in Flow 9]

\---

\---

## Flow 7 — Registered Customer Collects Order on Market Day

**Trigger:** Registered customer arrives at market to collect their packed order.
**Actors:** Registered Customer, Volunteer, Operator
**System State Required:** Market Day
**Channel:** PWA-VOL (volunteer), PWA-OP (operator), EXT (physical collection and payment)

### Steps

1. Registered Customer arrives at the market and presents themselves for order collection. \[EXT]
2. Volunteer locates the customer's packed order on the packing list. \[PWA-VOL]
3. Volunteer marks the order as Dispatched in the PWA. \[PWA-VOL]
4. System updates order status to Dispatched. \[SYSTEM]
5. Volunteer or operator checks if the customer has a balance due (order value minus advance paid, or any outstanding dues from previous weeks). \[PWA-VOL / PWA-OP]
6. If balance due: Customer pays balance in cash or UPI to the operator. \[EXT]
7. Operator records balance payment: amount and channel (cash or UPI). \[PWA-OP]
8. System credits wallet with balance payment received; clears the outstanding balance for this order. \[SYSTEM]
9. Customer collects their order and leaves. \[EXT]

### End State

Order status is Dispatched. Balance payment (if any) is recorded. Customer wallet reflects any balance payment received. Customer has physically received their order.

### Variants

**Customer does not show up on market day:** Order remains in Packed status. \[ASSUMED-confirmed: operator decides what to do with uncollected orders — dispose, or contact customer. No system flow covers this in MVP.]

**Customer disputes order contents at pickup (wrong item, wrong quantity):** Handled outside system via operator discretion. If a correction is needed, operator records it manually in reconciliation. \[ASSUMED-confirmed]

**Customer has no balance due (advance covered full order value):** Steps 5–8 are skipped. Customer collects directly after dispatch is marked.

**Customer partially pays balance due:** Has to be paid in full, partial payment is not allowed

### Assumptions

* \[ASSUMED-confirmed] The volunteer has sufficient PWA access to view balance due per customer, or the operator is present at the dispatch point to handle balance collection.
* \[ASSUMED-confirmed] There cannot be any Outstanding dues from previous weeks — operator discretion.

### Challenges

* \[CHALLENGE-confirmed] Volunteer marking dispatch and operator recording balance payment may happen at separate locations or by separate people. If the volunteer marks dispatch before the operator collects payment, the system shows the order as complete even if payment is outstanding. Consider whether dispatch marking should be gated on balance payment confirmation, or whether they remain independent actions.

\---

\---

## Flow 8 — Local Farmer Arrives at Market → Operator Records Inbound Items

**Trigger:** Local farmer arrives at the market with produce on market day.
**Actors:** Local Farmer, Operator
**System State Required:** Market Day
**Channel:** EXT (physical arrival), PWA-OP (operator)

### Steps

1. Local Farmer arrives at the market and presents their produce. \[EXT]
2. Operator and local farmer agree on items and quantities brought. \[EXT]
3. Operator opens the local farmer's record in the PWA. \[PWA-OP]
4. Operator records inbound items: item name (selected from produce list or added as a new item), quantity brought, unit type. One entry per item per farmer. \[PWA-OP]
5. System stores local farmer inbound quantities per item per farmer. Items are now available for sale in walk-in flows (Flows 9 and 10). \[SYSTEM]
6. Operator and local farmer agree on price per item — confirmed as the current week's produce list price for all items. \[EXT]

### End State

Local farmer's inbound items and quantities are recorded in the system. Items are available as a separate inventory pool for walk-in sales. Local farmer's expected payment is calculable (inbound qty × price, adjusted for items sold by end of day).

### Variants

**Local farmer brings an item not on the weekly produce list:** \[ASSUMED-confirmed: operator can add the item to the local farmer's inbound record with a manually entered price. The item does not appear on the registered customer preorder list — it is available for walk-in sales only. This needs PRD confirmation.]

**Multiple local farmers arrive at different times during market day:** Each farmer is recorded separately as they arrive. System accumulates all local farmer inbound records for the week.

**Local farmer brings fewer items than expected:** No system consequence — local farmer inbound is always recorded as actuals, not against a pre-committed quantity.

### Assumptions

* \[ASSUMED-confirmed] Local farmer items are tracked separately from outstation farmer items in inventory, even if the item name is the same.
* \[ASSUMED-confirmed] The operator records local farmer inbound at the time of arrival, not in advance.

### Challenges

* \[CHALLENGE-confirmed] If a local farmer brings an item also available in outstation inventory, the operator must consciously choose which source to deduct from when recording walk-in sales. The system shows both pools separately (per the resolved known issue), but the operator's attention may be split during a busy market day. A clear UI distinction between outstation and local farmer inventory is important.

\---

\---

## Flow 9 — Walk-in Sale (Anonymous or Loosely Registered Customer)

**Trigger:** A walk-in customer approaches the market stall and wishes to purchase produce.
**Actors:** Walk-in Customer, Operator
**System State Required:** Market Day
**Channel:** EXT (physical transaction), PWA-OP (operator)

### Steps

1. Walk-in Customer selects items they wish to purchase. \[EXT]
2. Operator opens the walk-in sales screen in the PWA. \[PWA-OP]
3. Operator selects the item from the current week's produce list. \[PWA-OP]
4. Operator selects the inventory source for this item: outstation farmer inventory or local farmer inventory. \[PWA-OP]
5. Operator enters quantity sold and amount collected. \[PWA-OP]
6. Operator selects payment channel (cash or UPI). \[PWA-OP]
7. Operator optionally records customer name and phone number (loosely registered). \[PWA-OP]
8. System records the sale: item, source inventory, qty, amount, channel, timestamp. \[SYSTEM]
9. System deducts sold quantity from the selected inventory source. Updates weekly financial summary. \[SYSTEM]
10. Operator collects payment from customer. \[EXT]
11. Customer receives produce and leaves. \[EXT]

### End State

Walk-in sale is recorded. Inventory is updated against the selected source (outstation or local farmer). Financial summary reflects the sale amount by channel. If customer was loosely registered, a lightweight record exists in the system.

### Variants

**Customer purchases from both outstation and local farmer inventory in one transaction:** Operator records two separate sale entries — one per inventory source. \[ASSUMED-confirmed: no multi-source basket in a single transaction record]

**Item is out of stock in selected inventory source:** System shows zero or negative balance. \[ASSUMED: system warns operator if selected source has insufficient quantity; operator can switch source or decline the sale]

**Anonymous customer (no details recorded):** Steps 7 is skipped. Sale is recorded without customer attribution. This is the default for most walk-in transactions.

### Assumptions

* \[ASSUMED-confirmed] Walk-in sales are recorded one transaction at a time by the operator. There is no queue or basket model for walk-in customers in MVP.
* \[ASSUMED-confirmed] The operator is the sole person recording walk-in sales. Volunteers do not record sales.

### Challenges

* \[CHALLENGE-confirmed] During a busy market day, the operator is simultaneously managing registered customer collections, balance payments, local farmer records, and walk-in sales. Recording each walk-in sale in the PWA may be too slow in peak periods. Walk-in sales can also be recorded in batch at end of day from paper notes.

\---

\---

## Flow 10 — Walk-in Sale Against Local Farmer Inventory

**Trigger:** A walk-in customer purchases produce drawn specifically from local farmer inventory.
**Actors:** Walk-in Customer, Operator, Local Farmer
**System State Required:** Market Day
**Channel:** EXT (physical transaction), PWA-OP (operator)

### Steps

1. Walk-in Customer selects an item. \[EXT]
2. Operator opens walk-in sales screen. \[PWA-OP]
3. Operator  selects the item. \[PWA-OP]
4. Operator selects local farmer inventory as the source. Selects the specific local farmer if multiple local farmers have brought the same item. \[PWA-OP]
5. Operator enters quantity sold and amount collected. \[PWA-OP]
6. Operator selects payment channel (cash or UPI). \[PWA-OP]
7. System records the sale against the specific local farmer's inbound record. Deducts from local farmer sold qty. Updates weekly financial summary. \[SYSTEM]
8. Operator collects payment. \[EXT]
9. Customer receives produce. \[EXT]

### End State

Sale is recorded against the local farmer's inventory. Local farmer sold qty is updated. The remaining unsold qty for that farmer is calculable (inbound qty − sold qty). Financial summary updated.

### Variants

**Multiple local farmers bring the same item:** Operator manually selects which local farmer's stock to deduct from. System does not auto-allocate across farmers. \[ASSUMED: operator uses physical proximity or farmer arrangement at the stall to decide which stock to sell first]

**Local farmer item not on the weekly produce list:** Operator manually enters the item with price during inbound recording (Flow 8). The item is then available for selection in walk-in sales. \[ASSUMED]

### Assumptions

* \[ASSUMED-confirmed] Local farmer sold qty is tracked per farmer per item — not as a single pooled local farmer inventory. This is required for accurate per-farmer payment calculation in Flow 11.
* \[ASSUMED-confirmed] Volunteer cannot record walk-in sales against local farmer inventory . Volunteers have write access only to packing and dispatch.

### Challenges

* \[CHALLENGE-confirmed] Multiple local farmers bring the same item and their produce is physically mixed. While the operator's ability to attribute each sale to the correct farmer is unreliable. Physical separation of stock by farmer is an operational requirement that the system cannot enforce. This must be communicated to the operator as a process discipline.

\---

\---

## Flow 11 — Local Farmer Payment at End of Market Day

**Trigger:** Market day sales are complete. Operator calculates and pays each local farmer.
**Actors:** Operator, Local Farmer
**System State Required:** Reconciliation (operator may initiate payment calculation at end of Market Day and record in Reconciliation)
**Channel:** EXT (physical payment), PWA-OP (operator records payment)

### Steps

1. Operator opens the local farmer payment screen in the PWA. \[PWA-OP]
2. System displays per local farmer: items brought (inbound qty), items sold (sold qty), items unsold (inbound − sold), amount due (sold qty × weekly price per item), totalled across all items. \[SYSTEM]
3. Operator reviews the amount due per farmer. \[PWA-OP]
4. Operator pays each local farmer in cash or UPI. \[EXT]
5. Local farmer takes back unsold produce. \[EXT]
6. Operator records payment in the PWA: amount paid and channel (cash or UPI). \[PWA-OP]
7. System marks local farmer as paid for the week. Updates weekly financial summary with local farmer expense (cash + bank). \[SYSTEM]

### End State

All local farmer payments are recorded. System knows items sold vs. items returned per farmer. Weekly financial summary reflects local farmer expenses by channel.

### Variants

**Local farmer disputes the sold qty:** Operator and farmer reconcile against physical stock count. Operator adjusts sold qty in the system before calculating payment. \[ASSUMED: operator can edit local farmer sold qty before marking payment]

**Operator pays partial amount (e.g., cash on hand is short):** \[ASSUMED: operator records partial payment; outstanding balance carried as a liability in the weekly summary. Same model as outstation farmer partial payment.]

### Assumptions

* \[ASSUMED-confirmed] Unsold produce returned to the local farmer is not recorded as a system expense — it simply reduces the sold qty, which reduces the payment due.
* \[ASSUMED-confirmed] Local farmer payment is always in the same week it is due — no carry-forward of local farmer payment to the following week, unlike outstation farmer liabilities.

### Challenges

* \[CHALLENGE-confirmed] Timing: the operator is physically paying local farmers at the end of market day while also managing reconciliation, registered customer balances, and outstation farmer payments. The system must make the local farmer payment calculation immediately accessible — no multi-step navigation required.

\---

\---

## Flow 12 — Outstation Farmer Payment → Operator Marks Paid

**Trigger:** Operator is ready to record payment to an outstation farmer for produce delivered this week.
**Actors:** Operator, Outstation Farmer
**System State Required:** Reconciliation
**Channel:** EXT (physical payment or UPI transfer), PWA-OP (operator records status)

### Steps

1. Operator opens outstation farmer payment screen in the PWA. \[PWA-OP]
2. System displays per outstation farmer: items delivered this week (delivered qty × agreed price per item), total amount due. \[SYSTEM]
3. Operator reviews the amount due per farmer. \[PWA-OP]
4. Operator pays the farmer via cash or UPI transfer outside the system. \[EXT]
5. Operator records payment in the PWA: payment status (paid / partial / unpaid), amount paid if partial, payment channel (cash or UPI). \[PWA-OP]
6. System updates outstation farmer payment status for the week. If partial, calculates and records outstanding liability. Updates weekly financial summary with outstation farmer expense (cash + bank). \[SYSTEM]
7. If unpaid or partial: outstanding liability is visible in the weekly summary and carried into the next week's opening liability position. \[SYSTEM]

### End State

Outstation farmer payment status is recorded for the week. Weekly financial summary reflects payments made by channel. Outstanding liabilities are visible and carried forward if unpaid or partial.

### Variants

**Farmer paid in full and not partially or next week:** Status set to Paid. No liability carried forward.

**Payment amount disputed with farmer:** Handled outside system via WhatsApp or phone. Operator records what is actually paid, not what was disputed. System reflects the actual transaction.

### Assumptions

* \[ASSUMED-confirmed] Outstation farmer payment is calculated on delivered quantity, not on ordered quantity. If a farmer delivered less than ordered, they are paid for what they delivered.
* \[ASSUMED-confirmed] The payment amount per farmer is calculated by the system and presented to the operator — the operator does not manually calculate it.

### Challenges

* \[CHALLENGE] If a farmer delivered less than ordered (shortfall) and customers received credits in Flow 5, the farmer's payment should reflect delivered qty — but the system must ensure the financial summary correctly nets these: customer credits reduce income, farmer payment reflects delivery, not order. These two adjustments must reconcile cleanly in the weekly summary. PRD must specify the financial flow explicitly.

\---

\---

## Flow 13 — Week Close → Weekly Financial Summary Generated

**Trigger:** Operator has completed all reconciliation actions and is ready to close the week.
**Actors:** Operator
**System State Required:** Reconciliation (transitions to Closed)
**Channel:** PWA-OP

### Steps

1. Operator verifies that all reconciliation actions are complete: all price differences confirmed, all outstation farmer payments marked, all local farmer payments recorded. \[PWA-OP]
2. System checks completeness: flags any unresolved price differences or unpaid/unrecorded farmer payments. \[SYSTEM]
3. If incomplete items exist, system lists them and blocks week close until all are resolved. The force-close path does not exist. \[PWA-OP]

4. Operator closes the week. \[PWA-OP]
5. System moves week to Closed state. All data entry locked — no further edits permitted. \[SYSTEM]
6. System generates the weekly financial summary: \[SYSTEM]

   * Preorder receipts (cash + bank)
   * Market day and walk-in receipts (cash + bank)
   * Outstation farmer expenses paid (cash + bank)
   * Local farmer expenses paid (cash + bank)
   * Wallet adjustments (total credits + total debits from price differences)
   * Outstanding customer dues (wallet balances with confirmed but unpaid balances)
   * Outstanding farmer liabilities (unpaid + partial outstation farmer amounts)
   * Opening balance (closing balance from previous week)
   * Closing balance (opening balance + receipts − expenses)
   * All figures split by channel: cash and bank separately
7. Operator reviews the weekly financial summary. \[PWA-OP]
8. Operator verifies closing balance against physical cash in hand and bank balance. \[EXT]

### End State

Week is in Closed state. Weekly financial summary is complete and read-only. Closing balance becomes the opening balance for the next week. Outstanding dues and liabilities are visible for follow-up.

### Variants

**First week on the new system:** Opening balance must be manually entered by the operator based on the actual cash and bank position at go-live. \[ASSUMED]

**Week with no outstation farmer liabilities and no customer dues:** Summary is clean. Closing balance = opening balance + receipts − expenses.

**Week with outstanding liabilities:** Summary clearly shows outstanding amounts per farmer and per customer. These do not auto-resolve — operator follows up manually.

### Assumptions

* \[ASSUMED-confirmed] The weekly summary is generated automatically on week close — the operator does not manually compile it.
* \[ASSUMED-confirmed] Closing balance is a calculated figure, not an operator-entered one. The operator verifies it against physical cash but does not override it in the system.
* \[ASSUMED-confirmed] The summary is available as a read-only view for all future reference — it is not deleted or archived away.

### Challenges

* \[CHALLENGE-confirmed] The closing balance calculation depends on every upstream entry being correct: wallet top-ups, order debits, walk-in sales, farmer payments, price adjustments. Any mis-entry upstream produces a wrong closing balance. There is no system audit or sanity check beyond the operator's manual verification against physical cash. Consider a simple variance alert: if system closing balance differs from operator-entered physical cash by more than a threshold, flag it.
* \[CHALLENGE-confirmed] Outstanding customer dues: if a customer has a negative effective balance (owes more than their wallet holds due to overdelivery debits), the system must show this clearly as a due rather than a wallet balance. The distinction between a low wallet balance and an actual debt owed must be explicit in the summary.

\---

## Open Items for PRD Confirmation

The following items were flagged across flows and must be explicitly specified in the PRD before development begins:

|#|Flow|Item|Impact|
|-|-|-|-|
|P1|Flow 1|Price edit after week is published: do existing confirmed orders reprice or retain original price? My response after review -Price edits are permitted in Open for Orders state; orders already entered at the old price order reverts to Pending Payment, operator informs customer. This is reconciled during market day settlement.|Wallet debit accuracy|
|P2|Flow 2|Can the operator edit a confirmed order before orders are locked? If yes, how is wallet recalculated? My response after review - Yes, this can be edited and wallet needs to be adjusted in line with this. If wallet is positive, no payment needed. If negative, this has to be paid offline and Operator adjusts this.|Order management screen design|
|P3|Flow 3|Pending Payment orders at time of order lock: can the operator confirm them post-lock? Or are they lost? My response after review - Customer has to pay before  order lock  — The operator manually calls the customer and records payment or deletes the order on non payment|Edge case but real operational scenario|
|P4|Flow 5|Overdelivery debit that exceeds customer wallet balance: what does the system do? My response after review - Debit wallet to zero, record the remainder as a customer due in the weekly summary, operator collects manually at next interaction|Financial integrity|
|P5|Flow 5|Can operator edit delivered quantity in reconciliation before confirming differences? My response after review - Yes|Reconciliation screen design|
|P6|Flow 6|Overdelivered outstation produce: is it available for walk-in sale? If yes, how is it added to available inventory? My response after review - overdelivered outstation produce is available for walk-in sales along with buffer quantity that is already received in inventory|Inventory model|
|P7|Flow 7|Uncollected orders: what happens to them in the system? My response after review - operator decides what to do with uncollected orders — dispose, or contact customer. And order is marked as delivered, with a comment option giving details|Order lifecycle completeness|
|P8|Flow 9|Multi-source basket: can a single walk-in transaction span both outstation and local inventory, or are they separate entries? My response after review - These are separate orders, |Walk-in sales screen design|
|P9|Flow 10|Does volunteer write access extend to walk-in sales, or is it restricted to packing and dispatch only? My response after review - confirming that volunteer cannot have write access to walk-in sales. Has access only for packing and dispatch .|Access control model|
|P10|Flow 11|Can operator edit local farmer sold qty before marking payment? My response after review - operator can edit local farmer sold qty before marking payment|Payment accuracy|
|P11|Flow 13|Can operator force-close a week with unresolved reconciliation items? My response after review - No|Week close gate logic|
|P12|Flow 13|First week opening balance: how is it entered? My response after review - Opening balance must be manually entered by the operator based on the actual cash and bank position at go-live|Onboarding / go-live process|

\---

*Document prepared for internal use. Do not distribute. Flows 1–5 require explicit review and confirmation before PRD work begins.*

