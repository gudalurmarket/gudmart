

Here is your handoff prompt. Attach all four files when you start the new chat.



Files to attach:



context\_v4.md

decisions.md

process\_map.md

interactions\_flows.md (version 1.1 — Confirmed)





Prompt to paste:



You are a B2C functional and technical expert with full product lifecycle development expertise, familiar with small and medium businesses in South India.

Project Background

I am building a digital system for a community-driven organic farmer marketplace operating weekly in the Gudalur–Ooty region. The current system is entirely manual — WhatsApp messages, Excel sheets, UPI screenshots, and cash.

Core user profile: farmers and customers are predominantly 45+ years of age, WhatsApp-native, low technical familiarity, \~30–40% low literacy.

Guiding Principle



Automate high-impact operator actions. Preserve low-impact manual habits.





Document Status

All four pre-PRD documents are complete and confirmed. They are attached. Read all four before responding. Do not reconstruct context from this prompt alone.

DocumentStatuscontext\_v4.mdComplete and confirmed — single source of truth for actors, lifecycle, inventory, payment, and pricingdecisions.mdComplete and confirmed — all open decisions resolvedprocess\_map.mdComplete and confirmed — full week lifecycle, actor actions by state, state-action gate tableinteractions\_flows.mdVersion 1.1 Confirmed — all 13 flows reviewed and confirmed, all gate conditions met



All Gate Conditions for PRD Are Met

ConditionStatuscontext\_v4.md complete✅decisions.md complete✅process\_map.md complete✅interactions\_flows.md — all 13 flows confirmed✅Three known issues resolved✅Both open decisions resolved✅All 12 PRD open items resolved✅



Key Confirmed Decisions (full detail in decisions.md)



Order intake: WhatsApp Business API B-Assisted — messages ingested and parsed, operator reviews and approves before order enters system. FCFS timestamp at message receipt, not operator confirmation.

Customer queries: Option A — operator relays via WhatsApp. No customer-facing system in MVP.

Wallet debit: At order confirmation, not at reconciliation.

Strict wallet rule: Wallet must fully cover order value before confirmation. No exceptions.

Price increase after order confirmation: Order reverts to Pending Payment if wallet no longer covers revised value. Operator informs customer and collects shortfall before re-confirmation.

Order amendments after lock: Not permitted. Additions treated as walk-in purchases on market day.

Pending Payment at order lock: No post-lock confirmation path. Operator calls customer and records payment before lock, or deletes the order on non-payment.

Overdelivery debit exceeding wallet balance: System debits wallet to zero, records remainder as customer due in weekly summary. Operator collects manually at next interaction.

Walk-in inventory source: Operator manually selects outstation or local farmer inventory at point of sale. Volunteer has no write access to walk-in sales.

Force-close with unresolved reconciliation items: Not permitted. System blocks week close until all items resolved.

Pricing: One price per item per week applies to all channels and both farmer types.

First week opening balance: Manually entered by operator at go-live based on actual cash and bank position.

Uncollected orders: Operator decides — dispose or contact customer. Order marked as delivered with comment.

Volunteer access: Packing and dispatch only. No write access to walk-in sales.

Local farmer payment: Same-week only. No carry-forward. Operator can edit sold qty before marking payment.

Outstation farmer payment: Calculated on delivered quantity, not ordered quantity. Partial and unpaid statuses carry forward as liabilities.





Resolved Known Issues

\#IssueResolution1Same-item overlap — local and outstation farmerSeparate physical stock, separate display, payment attribution manual2Loosely registered customer conversionNot a designed flow in MVP — fresh registration if needed3Local farmer pricingOne price list for all — weekly produce list price applies everywhere



Your Task

Produce PRD.md — the Product Requirements Document for the MVP.

Structure the PRD to cover at minimum:



Product overview and guiding principles

Actors and access model

Market week lifecycle and state machine

Functional requirements by feature area — organised by the operator PWA screens and the volunteer PWA screens

Data model — entities, key fields, relationships

WhatsApp Business API integration — B-Assisted order intake flow, parsing requirements, fallback handling

Wallet and payment model — rules, ledger structure, edge cases

Inventory model — outstation vs local farmer, overdelivery, walk-in sales

Reconciliation model — price differences, wallet adjustments, farmer payments

Weekly financial summary — structure, calculations, cash vs bank split

Non-functional requirements — performance, language, device, cost, connectivity

Out of scope for MVP

Open items and post-MVP roadmap



Rules



Ground every requirement in the four attached documents. Do not introduce anything not already confirmed.

Flag any gap you encounter with \[GAP — needs confirmation] before proceeding past it.

Do not hallucinate. If you are unsure, ask.

Do not start ARCHITECTURE.md in this conversation.

The PRD is the single implementation-ready specification. Write it to that standard — specific enough that a developer can build from it without needing to ask clarifying questions on confirmed decisions.



First Action

Acknowledge that you have read all four attached documents. Confirm your understanding of the B-Assisted order intake model, the strict wallet rule, the FCFS mechanism, and the volunteer access scope.

Then ask me to say "produce PRD.md" before you begin.

Do not produce anything yet.

