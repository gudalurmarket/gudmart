B2C Farmer Marketplace – Refined Context Document



1\. Background



A community-driven organic market operates weekly in Gudalur–Ooty, where \~10 farmers supply produce and customers pre-order via WhatsApp. The current system is manual, semi-structured, and not scalable.

\-----------------



2\. Actors



Farmers: Provide weekly availability (items, approx quantity, price), ships to market at Gudalur

Customers: Pre-Order via WhatsApp. Pay advance manually. Take physical delivery at market. Pays cost difference if any.

Operator: Manages orders manually. Places order with a buffer. Breaks down bulk from various farmers to customer specific orders.

Works out Payment reconciliation and order differences if any.

Volunteers: Handles packing and distribution. May also do coordination on behalf of the operator.



\----------------





3\. Current Workflow



Individual Farmers send weekly produce list with operator (Friday)

&#x09;	|

&#x09;	|

Operator consolidates into Excel

&#x09;	|

&#x09;	|

Operator shares list with customers in WhatsApp group.

&#x09;	|

&#x09;	|

Customers place orders individually to operator

&#x09;	|

&#x09;	|

Operator manually records orders against customers

&#x09;	|

&#x09;	|

Advance Payments made by customers via UPI + screenshots to operator

&#x09;	|

&#x09;	|

Orders aggregated with added buffer (10-30%) at farmer level

&#x09;	|

&#x09;	|

Bulk consolidated Orders sent to individual farmers (Monday)

&#x09;	|

&#x09;	|

Produce arrives (Wednesday)

&#x09;	|

&#x09;	|

Volunteers pack orders which are customer specific

&#x09;	|

&#x09;	|

Customers pick up orders at market and pay price differences

&#x09;	|

&#x09;	|

Operator reconciles payments and order/price differences if any

&#x09;	|

&#x09;	|

Process Pending Orders/Order reconciliation



\--------------

4\. Key Challenges



Operational Issues with manual effort

Manual order entry and aggregation

Payment verification via screenshots

Potential errors with manual processes

Weight mismatch (weight vs unit) - At time of ordering vs delivery needs major manual reconciliation

Inventory uncertainty

No automation

Multilingual users (Tamil, English)

Low literacy (\~30–40%)



\------------

5\. Core Problem Statement



Transform a manual, WhatsApp-based ordering system into a scalable, simple, multilingual digital workflow without disrupting user habits.

\----------

6\. Objectives



Reduce manual workload

Structure ordering process

Improve payment tracking and order tracking/deficits

Support multilingual interaction

Maintain simplicity for low-literacy users

\---

7\. MVP Scope



Must Have

Structured ordering interface, Retaining text based WhatsApp user convenience

Order aggregation automation

Basic payment tracking

Multilingual Interactions



Not in MVP

AI-based pricing

Advanced analytics

Complex UI features

Voice based interacions

\---



8\. Functional Requirements



Users can view available items

Users can select quantity easily

System aggregates total demand

Admin can view consolidated orders

Payment status is tracked

Wallet system for customers



\---

9\. Non-Functional Requirements



Multilingual support (Tamil, English)

Works on low-end devices

Minimal cost solution

Simple UI (icons, minimal text)



\---





10\. Constraints



Weekly batch system (not real-time)

Inventory is Approximate

Low technical familiarity of users



\---



11\. Design Principles



Simplicity over features

Simple interface with prioritizing text with very basic UI/Icons for persons with low literacy

Minimize typing

Assist, not replace, WhatsApp

Avoid AI usage to minimize costs



\---





12\. Non-functional requirements:

Multilingual capabilities





13\. Technical Considerations:

Preference is for a NoSQL db. Prefer Free tier only and stay on purely serverless/zero-cost infrastructure, where possible.





14\. Guardrails that are non-negotiable:

Cost consideration for solution should be a minimalist approach





15\. Future Scope



Voice-based ordering

Farmer-side interface

Inventory prediction

