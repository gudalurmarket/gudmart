const historyEntry = {
  from_state: currentState,
  to_state: targetState,
  changed_at: at,
  changed_by: actorId
}

if (note != null) {
  historyEntry.note = note
}