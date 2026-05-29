# B2C Farmer Marketplace – Decisions Document

**Version:** 1.0
**Status:** Final – Confirmed Before PRD
**Last Updated:** April 2026
**Depends On:** context\_v4.md

\---

## Purpose

This document records all decisions that were open during context definition and must be resolved before the PRD can be written. Each decision captures the options considered, the risks and trade-offs, the resolution, and the conditions attached to it.

\---

## Decision 1 — Customer Order Intake Method

### Context

Registered customers currently send weekly orders to the operator via WhatsApp in free-form text. The operator manually transcribes these into Excel. The question is how this intake step works in the new system.

### Options Considered

**Option A — Fully Manual (Operator Entry)**
Customers WhatsApp the operator as today. Operator reads each message and manually types the order into the PWA. Zero change for customers. Full operator burden retained for order entry. No API or parsing required.

**Option B — Fully Automated (WhatsApp Bot)**
WhatsApp Business API bot receives customer messages and auto-parses them into structured orders that enter the system directly without operator involvement. Operator is notified but does not confirm individual orders. Highest automation; highest setup complexity and parsing risk.

**Option B-Assisted — Semi-Automated with Operator Confirmation (Selected)**
WhatsApp Business API receives customer messages. System parses each message into a structured order (product name, quantity, unit). Operator sees a confirm/edit screen in the PWA showing the customer name and parsed order. Operator corrects any parsing errors and approves. Order enters system only on operator approval, with FCFS timestamp recorded at the point the customer's message was received.

### Decision

**Option B-Assisted is the confirmed MVP approach.**

### Rationale

Option A retains the full typing burden on the operator and does not reduce effort for the highest-volume manual task in the week. Option B carries unacceptable risk — free-form Tamil/English messages, abbreviations, and voice notes from 45+ year old low-literacy customers will produce frequent parse failures, and without operator confirmation these errors enter the system unchecked. Option B-Assisted captures the effort reduction of automation (one-tap confirm for clean parses) while keeping the operator as the error-correction layer. Customer behaviour is completely unchanged.

### Trade-offs Accepted

* Operator still reviews every order — effort reduction comes from confirming rather than typing, not from eliminating review
* Parser accuracy will be low early on for mixed Tamil/English messages and abbreviations; operator edits will be frequent until the parser is tuned
* Tamil voice note handling is out of scope for MVP; voice messages will be flagged to operator for manual entry
* Setup requires a verified WhatsApp Business API account and an always-on webhook endpoint

### Prerequisites and Gate Conditions

|Prerequisite|Status|
|-|-|
|WhatsApp Business API account verified and active before MVP launch|**Confirmed**|
|Always-on webhook endpoint for message ingestion (free-tier hostable)|To be set up during Sprint 0|
|Rule-based parsing layer for product name, quantity, and unit extraction|To be built in MVP scope|
|Operator confirm/edit screen in PWA|In MVP scope|

### Impact on PRD

* PWA must include a message inbox or order intake queue screen showing incoming customer messages alongside parsed order previews
* Parser must handle: numeric quantities, unit abbreviations (kg, gm, pcs, piece, bunch), common product name variants and misspellings in English
* Voice notes must be flagged as requiring manual operator entry — no speech-to-text in MVP (runtime AI constraint)
* Tamil text messages: operator manually corrects parsed output — no dynamic translation in MVP
* FCFS timestamp must be recorded at message receipt time, not at operator confirmation time
* Failed or ambiguous parses must surface clearly to operator with the original message visible alongside

### Post-MVP Path

Once parsing accuracy is established and the operator confirmation pattern is stable, the confirm step can be made optional for high-confidence parses. Full bot automation (Option B) is deferred until behaviour stabilises.

\---

## Decision 2 — Customer Self-Service Query Channel

### Context

Registered customers currently ask the operator directly via WhatsApp for order status, wallet balance, and payment dues. The question is whether the system should provide customers with a way to check this themselves.

### Options Considered

**Option A — Operator-Relayed via WhatsApp (Selected)**
Customers continue to message the operator via WhatsApp. Operator looks up the information in the PWA and replies. No customer-facing system access required.

**Option B — Minimal Read-Only PWA View for Customers**
A lightweight customer-facing PWA screen showing order status and wallet balance. Customers access it via a link shared by the operator. Requires authentication design for low-literacy, low-tech-familiarity users.

### Decision

**Option A is the confirmed MVP approach.**

### Rationale

Registered customers are 45+ years of age with low technical familiarity. Introducing a PWA login flow — even a minimal one — adds a support burden that the operator will bear when customers cannot access or navigate it. The operator already has all the information in the PWA dashboard; relaying it via WhatsApp is a low-frequency action that does not meaningfully increase operator effort. Option B adds development scope and user-support risk for a problem that is not high-frequency or high-impact at current scale (\~50 customers).

### Trade-offs Accepted

* Operator remains the information relay for customer queries — adds minor effort but low volume
* Customers have no independent visibility into their wallet or order status
* As customer count grows, relay effort will increase — this is the trigger for reconsidering Option B

### Prerequisites and Gate Conditions

No prerequisites. This option requires no additional infrastructure.

### Impact on PRD

* No customer-facing authentication or PWA view in MVP scope
* Operator PWA must surface wallet balance and order status per customer in a format easy to read and relay quickly via WhatsApp
* Pre-formatted WhatsApp reply templates (Tamil + English) are a desirable operator aid — operator copies and pastes balance/order information into template and sends

### Post-MVP Path

Revisit when registered customer count exceeds 80–100 or when operator query-relay volume becomes a measurable burden. Option B (minimal read-only PWA) is the natural next step. WhatsApp bot auto-reply for balance queries is an alternative path once the Business API is live from Decision 1.

\---

## Decision 3 — Semi-Automated Approach: Parsing Scope and Fallback Behaviour

### Context

Option B-Assisted (Decision 1) introduces a parsing layer that did not exist in the original Option A/B framing. The parsing scope and fallback behaviour must be explicitly decided before the PRD specifies the intake screen.

### Decision

**Parsing scope for MVP:**

|Input Type|MVP Handling|
|-|-|
|English text, numeric quantities, standard units|Rule-based parser — product name match against weekly produce list, quantity extraction, unit normalisation|
|Mixed Tamil/English text|Parser attempts English tokens; Tamil tokens flagged for operator review with original message shown|
|Abbreviations and common variants|Parser maintains a mapping table (e.g., "cauli" → Cauliflower, "1/2" → 0.5) — operator-editable post-MVP|
|Voice notes|Flagged to operator as requiring manual entry — no speech-to-text in MVP|
|Images (e.g., handwritten lists)|Flagged to operator as requiring manual entry — no OCR in MVP|
|Ambiguous or unrecognised product names|Flagged with original message visible — operator selects correct product from produce list|

**Fallback behaviour:** Any message that produces zero parseable line items is surfaced to the operator as a raw message for full manual entry. The system never silently drops a customer message.

**FCFS timestamp:** Recorded at message receipt time (API webhook timestamp), not at operator confirmation time. This is the timestamp used for shortfall prioritisation.

### Impact on PRD

* Parsing layer is a built component, not a third-party AI service — rule-based, operator-tunable
* Operator intake screen must always show the original raw message alongside the parsed preview
* A mapping/synonym table for product name variants must be part of the system configuration
* Zero silent message drops — every received message must appear in the operator queue

\---

## Decision Summary

|#|Decision|Resolution|Status|
|-|-|-|-|
|1|Customer order intake method|Option B-Assisted: WhatsApp API ingestion + operator confirm/edit before order enters system|**Confirmed**|
|2|Customer self-service query channel|Option A: Operator relays via WhatsApp; no customer-facing system in MVP|**Confirmed**|
|3|Parsing scope and fallback behaviour for B-Assisted intake|Rule-based parser; voice/image flagged for manual entry; zero silent drops; FCFS at receipt time|**Confirmed**|

\---

## Resolved Issues (Carried from Context)

These were flagged as known issues during context definition. All three are resolved and recorded here for completeness.

|#|Issue|Resolution|
|-|-|-|
|1|Same-item overlap — local and outstation farmer supply same item|Separate physical stock; separate display; payment attribution manual by operator|
|2|Loosely registered walk-in customer conversion to fully registered|Not a designed flow in MVP; handled as fresh registration if needed|
|3|Local farmer pricing — upfront or market-day negotiation|One price list for all; weekly produce list price applies to all channels and both farmer types|

\---

## Gate Status for PRD

|Gate Condition|Status|
|-|-|
|context\_v4.md complete and reviewed|✅ Complete|
|decisions.md complete|✅ This document|
|process\_map.md complete|⏳ To be produced|
|interactions\_flows.md reviewed — flows 1–5 confirmed|⏳ To be produced|
|Three known issues resolved|✅ Complete|
|Both open decisions resolved|✅ Complete|

\---

*Document prepared for internal use. Do not distribute.*

