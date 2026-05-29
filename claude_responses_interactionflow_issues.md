Here are my responses to your queries:

I1-P3 Pending Payment after lock: Yes, operator can confirm a late-paying customer's order after lock via manual override.


I1-P4 Overdelivery debit exceeds wallet: Debit to zero + record remainder as due, or block the debit and flag: Flagged as overdue and handled at the market manually by operator


I1-P11 Force-close with unresolved items Yes or no: can operator force-close a week with unresolved reconciliation items - No, any unresolved reconciliation needs to be flagged

I1-P12 First week opening balance How does the operator enter it — manual field at week creation, or a separate go-live setup screen - Manual

I2 Balance payment at pickup: Full payment enforced (order held if short), or partial accepted with remainder as customer due - Full payment before order lock, no partial payment accepted.

I3 Outstanding dues from previous weeks Confirm: system records and displays prior dues but does not enforce collection — operator discretion- Yes, system records and displays prior dues and flags it.

I4 Volunteer walk-in sales access Operator only, or operator and volunteer both - Both 

I5 Flow 6 FCFS wording Confirm: system does make item-level FCFS allocations; rounding unit is 0.1kg for weight items - FCFS depends on the time-stamp of when the customer's order message is received. An earlier timestamp has higher priority. No rounding off for weight- should be exact

I6 Order amendment exceeds wallet Confirm: same strict wallet rule applies — amendment held in Pending Payment if wallet insufficient - Yes

