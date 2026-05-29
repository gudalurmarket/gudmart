This is a sample WhatsApp flow:

# WhatsApp-First Marketplace System

## Functional Interaction Flow (MVP → Scalable Design)

\---

## 1\. System Principle

Automate high-impact operator actions while preserving existing WhatsApp-based behavior for farmers and customers.

* No change to farmer interaction
* No change to customer ordering behavior in MVP
* Operator remains the control layer
* Automation is assistive, not autonomous

\---

## 2\. Actors

**Operator**

* Uses PWA dashboard
* Confirms and manages all system actions

**Farmer**

* Sends produce list via WhatsApp (text / Tamil / voice)
* No system access

**Registered Customer**

* Sends orders via WhatsApp chat
* Pays via UPI
* Wallet maintained internally

**Volunteer**

* Uses PWA to pack and manage orders

\---

## 3\. End-to-End Workflow

\---

### Step 1: Farmer Sends Produce List

**Input Types**

* Text (English / Tamil)
* Voice note

**System Handling**

* Capture incoming WhatsApp message
* If voice:

  * Convert to text using speech-to-text
* Normalize language (Tamil → mapped product names)

**Output**

* Structured candidate product list

**Operator Action**

* Review parsed list
* Confirm or edit

\---

### Step 2: Product List Entry into System

**Automation Goal**
Eliminate manual Excel entry

**System Behavior**

* Parse message into:

  * Product name
  * Quantity
  * Unit (kg, piece, etc.)

**Operator Interface**

* Preview parsed list
* Edit if required
* Confirm

**Result**

* Products stored in database for the week

\---

### Step 3: Broadcast to Customers

**System Action**

* Generate formatted product list message

**Operator Action**

* Copy and send in WhatsApp group

**Format Example**

* Product name
* Price per unit
* Simple ordering instructions

**Note**
No automation required for sending in MVP

\---

### Step 4: Customer Order Intake (FCFS)

**Input**

* Customers send free-form WhatsApp messages

**System Handling**

* Capture incoming message
* Identify customer via phone number
* Parse:

  * Product names
  * Quantities

**Operator Interface**

* Display:

  * Customer name
  * Parsed order
* Options:

  * Confirm
  * Edit

**Result**

* Order stored under customer profile

\---

### Step 5: Payment and Wallet Management

**Input**

* Customer sends UPI screenshot

**System Handling**

* Detect and tag image as payment proof

**Operator Action**

* Enter received amount manually

**System Update**

* Add amount to customer wallet
* Deduct order value when processed

\---

### Step 6: Order Aggregation for Farmer

**System Action**

* Aggregate all confirmed orders
* Compute total required quantity per product
* Add buffer (configurable: 10–30%)

**Output**

* Final procurement list

**Operator Action**

* Send aggregated list to farmer via WhatsApp

\---

### Step 7: Farmer Supply and Payment

**Input**

* Farmer delivers produce

**Operator Action**

* Record payment made to farmer

**System**

* Maintain transaction record

\---

### Step 8: Packing (Volunteer Flow)

**Interface**

* Mobile PWA

**Features**

* View order list
* Mark:

  * Packed
  * Pending

\---

### Step 9: Customer Pickup and Shortage Handling

**Scenario**

* Item shortage occurs

**System Handling**

* Adjust fulfilled quantity
* Calculate refund amount

**Action**

* Credit refund to customer wallet

\---

## 4\. Automation Design

\---

### Core Automation Layers

**1. Message Ingestion**

* Capture WhatsApp messages via API

**2. Pre-processing**

* Speech-to-text (for voice)
* Language normalization

**3. Parsing Engine**

* Extract:

  * Product
  * Quantity
  * Unit

**4. Operator Confirmation Layer**

* No auto-finalization
* Always requires approval

\---

## 5\. Key Design Decisions

\---

### Customer Order Intake

* WhatsApp-based ordering retained
* Orders parsed automatically
* Operator confirms

**Decision**: Semi-automated (operator-assisted)

\---

### Customer Queries (Order status, wallet)

* Operator replies using templates
* No customer-facing system in MVP

**Decision**: Manual with assisted responses

\---

### WhatsApp Bot

* Not implemented in MVP
* Consider only after behavior stabilizes

**Decision**: Deferred

\---

## 6\. Critical Rules

\---

**1. No behavior change in MVP**

* Farmers and customers continue using WhatsApp naturally

**2. No full automation without validation**

* All parsed data must be confirmed by operator

**3. Focus on operator efficiency**

* Reduce typing
* Reduce context switching
* Reduce cognitive load

\---

## 7\. System Outcome

\---

**Without changing user habits, system achieves:**

* Automated data entry from messages
* Structured order management
* Centralized tracking (orders, payments, inventory)
* Reduced operator workload (estimated 60–80%)

\---

## 8\. Future Enhancements (Post-MVP)

\---

* Structured WhatsApp ordering formats
* Keyword-based auto replies
* Payment gateway integration
* Full WhatsApp bot (only after adoption stabilizes)

\---

If you want, the next logical step is converting this into:

* PRD (Product Requirements Document)
* Database schema
* Operator UI wireframes

Those will make this implementation-ready.

