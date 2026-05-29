# B2 State Machine Specification: `market_weeks` Lifecycle

## 1) Purpose and Scope

This document defines the authoritative state machine for the `market_weeks.state` field.

It specifies:
- Valid transitions
- Invalid transitions
- State-gated action permissions
- Transition side-effects
- Audit logging behavior
- Enforcement and validation rules

This is a strict, deterministic lifecycle. State transitions are controlled and must never be mutated directly.

---

## 2) States (in strict order)

1. `setup`
2. `open`
3. `locked`
4. `delivery`
5. `market_day`
6. `reconciliation`
7. `closed`

`closed` is terminal.

---

## 3) Deterministic Transition Model

### 3.1 Forward-only canonical path

The canonical lifecycle is:

`setup -> open -> locked -> delivery -> market_day -> reconciliation -> closed`

### 3.2 Core transition constraints

- No state may be skipped.
- No backward transitions are allowed.
- No self-transition (`X -> X`) is allowed.
- Any transition not explicitly listed as valid is invalid and must be rejected.
- `closed` has no outgoing transitions.

---

## 4) Valid Transitions

Exactly these transitions are valid:

- `setup -> open`
- `open -> locked`
- `locked -> delivery`
- `delivery -> market_day`
- `market_day -> reconciliation`
- `reconciliation -> closed`

All valid transitions are conditional on validator checks and authorization.

---

## 5) Invalid Transitions (Reject List)

All of the following categories are invalid and must be rejected:

1. **State skipping**
   - `setup -> locked`
   - `open -> delivery`
   - `delivery -> reconciliation`
   - Any equivalent skip

2. **Backward moves**
   - `open -> setup`
   - `locked -> open`
   - `market_day -> delivery`
   - Any equivalent backward transition

3. **Self-transitions**
   - `setup -> setup`, `open -> open`, etc.

4. **Transitions from terminal state**
   - `closed -> setup`
   - `closed -> open`
   - `closed -> locked`
   - `closed -> delivery`
   - `closed -> market_day`
   - `closed -> reconciliation`
   - `closed -> closed`

5. **Any undefined edge**
   - If `(from, to)` is not in Section 4, reject.

---

## 6) Action Permissions by State

The system must enforce these permissions for the requested action categories:
- customer order placement
- order modification
- farmer assignment
- delivery updates
- reconciliation

### 6.1 Permission matrix

| State | Customer Order Placement | Order Modification | Farmer Assignment | Delivery Updates | Reconciliation |
|---|---|---|---|---|---|
| `setup` | Not allowed | Not allowed | Not allowed | Not allowed | Not allowed |
| `open` | Allowed | Allowed | Not allowed | Not allowed | Not allowed |
| `locked` | Not allowed | Not allowed | Allowed | Not allowed | Not allowed |
| `delivery` | Not allowed | Not allowed | Not allowed | Allowed | Not allowed |
| `market_day` | Not allowed | Not allowed | Not allowed | Not allowed | Not allowed |
| `reconciliation` | Not allowed | Not allowed | Not allowed | Allowed (only correction scope) | Allowed |
| `closed` | Not allowed | Not allowed | Not allowed | Not allowed | Not allowed |

### 6.2 Deterministic interpretation notes

- **Customer order placement** means creation/confirmation of customer orders for the active week.
- **Order modification** means editing existing customer orders (items/quantities/cancel flow subject to business rules).
- **Farmer assignment** means allocation/planning records for farmer-side fulfilment.
- **Delivery updates** means recording or correcting delivered quantities.
- **Reconciliation** means confirming variances and settlement-related finalization activities.

If an action is not listed as allowed in the current state, the request must be rejected.

---

## 7) Transition Side-Effects (On State Entry)

On successful transition to each target state, the following side-effects apply.

### 7.1 Entering `open` (from `setup`)

- Week is marked available for customer ordering workflows.
- Customer order placement and order modification are enabled.
- Any state-gated UI/API capabilities should reflect open ordering window.

### 7.2 Entering `locked` (from `open`)

- Customer order placement is disabled.
- Order modification is disabled.
- Farmer assignment is enabled.
- Operationally freezes customer-facing order intake for that week.

### 7.3 Entering `delivery` (from `locked`)

- Farmer assignment changes are no longer permitted.
- Delivery update workflows are enabled for incoming produce handling.
- Week enters fulfillment capture mode.

### 7.4 Entering `market_day` (from `delivery`)

- Delivery update flows move out of normal delivery-entry mode.
- Market-day operations become active.
- Reconciliation remains unavailable until next transition.

### 7.5 Entering `reconciliation` (from `market_day`)

- Reconciliation workflows are enabled.
- Delivery updates may be permitted only as reconciliation-time corrections.
- Week enters financial and quantity closure verification phase.

### 7.6 Entering `closed` (from `reconciliation`)

- Week becomes immutable for operational workflows.
- All state-gated actions in Section 6 are disabled.
- No further transitions are allowed (terminal state).

---

## 8) Audit Logging Requirement (`state_history`)

Every successful transition must append one entry to `state_history` with this exact shape:

```json
{ "from": "<previous_state>", "to": "<next_state>", "at": "<timestamp>", "by": "<actor_id>" }
```

### 8.1 Rules

- Append-only: existing history entries must never be edited or removed.
- One entry per successful transition, in execution order.
- `from` must equal the persisted pre-transition state.
- `to` must equal the persisted post-transition state.
- `at` is server-generated transition timestamp.
- `by` is the authenticated actor identity that triggered the transition.
- If transition fails validation, **no history entry is written**.

---

## 9) Enforcement and Validation Rules

### 9.1 No direct mutation

- Direct writes to `market_weeks.state` are prohibited.
- All state changes must be executed through a dedicated transition endpoint/service guarded by a validator.

### 9.2 Mandatory validator

Every transition request must pass validator checks before persistence:

1. Current state exists and is recognized.
2. Target state exists and is recognized.
3. `(from, to)` is explicitly valid (Section 4).
4. No skip/backward/self transition.
5. `closed` cannot transition further.
6. Caller is authorized to perform transition.
7. Business gate conditions for that edge (if defined by business policy) are satisfied.

If any check fails:
- Reject transition.
- Keep state unchanged.
- Do not append to `state_history`.

### 9.3 Determinism guarantees

- For the same `(current_state, requested_transition, authorization, gate_inputs)`, outcome must be identical.
- No hidden or time-dependent alternate paths.
- No implicit auto-transitioning between states.

---

## 10) Error Semantics for Invalid Transitions

On invalid transition attempts, return a deterministic validation error that includes:
- current state
- requested target state
- rejection reason code

Suggested reason codes:
- `INVALID_STATE`
- `INVALID_TRANSITION`
- `STATE_SKIP_NOT_ALLOWED`
- `BACKWARD_TRANSITION_NOT_ALLOWED`
- `TERMINAL_STATE`
- `ACTION_NOT_PERMITTED_IN_STATE`
- `TRANSITION_GATE_FAILED`

---

## 11) Compliance Checklist

A transition implementation is compliant only if all are true:
- Uses only valid edges in Section 4
- Rejects all invalid categories in Section 5
- Enforces action permissions in Section 6
- Applies state-entry side-effects in Section 7
- Appends exact audit record shape in Section 8
- Enforces no-direct-mutation and validator-only flow in Section 9
- Treats `closed` as terminal

## 12) Transition Preconditions (Business Gates)

Define required conditions before allowing transitions:

- open → locked:
  - ordering window closed (time-based or manual trigger)

- locked → delivery:
  - all farmer assignments completed

- delivery → market_day:
  - delivery capture completed

- market_day → reconciliation:
  - market operations completed

- reconciliation → closed:
  - reconciliation completed and all dues settled