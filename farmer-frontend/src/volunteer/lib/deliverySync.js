const DB_NAME = 'pannai-volunteer'
const STORE_NAME = 'delivery-queue'

function openDb () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

/**
 * Writes one pending delivery entry to IndexedDB.
 * Key: `${weekId}:${productId}` — last-write-wins per product per week.
 */
export async function enqueueEntry (weekId, productId, assignmentId, deliveredQty) {
  try {
    const db = await openDb()
    const key = `${weekId}:${productId}`
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put({ weekId, productId, assignmentId, deliveredQty, queuedAt: Date.now() }, key)
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  } catch {
    // silent — volunteer sees offline banner and knows to retry
  }
}

/**
 * Returns Map<productId, { assignmentId, deliveredQty }> for the given weekId.
 */
export async function loadQueue (weekId) {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const map = new Map()
      const req = store.openCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) { resolve(map); return }
        if (cursor.key.startsWith(`${weekId}:`)) {
          const productId = cursor.key.split(':').slice(1).join(':')
          map.set(productId, cursor.value)
        }
        cursor.continue()
      }
      req.onerror = (e) => reject(e.target.error)
    })
  } catch {
    return new Map()
  }
}

/**
 * Reads all entries for weekId and PATCHes each to the server.
 * On per-entry success: deletes from IndexedDB.
 * On per-entry failure: leaves in queue for next retry.
 * Processes sequentially — partial flushes are acceptable and correct.
 */
export async function flushQueue (weekId, apiPatch) {
  try {
    const db = await openDb()

    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const results = []
      const req = store.openCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) { resolve(results); return }
        if (cursor.key.startsWith(`${weekId}:`)) {
          const productId = cursor.key.split(':').slice(1).join(':')
          results.push({ idbKey: cursor.key, productId, ...cursor.value })
        }
        cursor.continue()
      }
      req.onerror = (e) => reject(e.target.error)
    })

    for (const entry of entries) {
      try {
        await apiPatch(
          `/api/v1/weeks/${weekId}/delivery/${entry.assignmentId}`,
          { deliveredQty: entry.deliveredQty },
        )
        await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite')
          tx.objectStore(STORE_NAME).delete(entry.idbKey)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        })
      } catch {
        // keep in queue — will retry on next reconnect
      }
    }
  } catch {
    // silent — never throw to callers
  }
}

/**
 * Deletes all IndexedDB entries matching weekId.
 * Used for cleanup after week closes.
 */
export async function clearQueue (weekId) {
  try {
    const db = await openDb()

    const keys = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const found = []
      const req = store.openCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) { resolve(found); return }
        if (cursor.key.startsWith(`${weekId}:`)) {
          found.push(cursor.key)
        }
        cursor.continue()
      }
      req.onerror = (e) => reject(e.target.error)
    })

    for (const key of keys) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    }
  } catch {
    // silent
  }
}
