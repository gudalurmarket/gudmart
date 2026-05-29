'use strict'

const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')

const LOCAL_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json')

/**
 * Load service account credentials.
 * Local dev: server/config/serviceAccountKey.json (gitignored).
 * Production: FIREBASE_SERVICE_ACCOUNT_JSON — base64-encoded service account JSON.
 */
function loadServiceAccount () {
  if (fs.existsSync(LOCAL_KEY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_KEY_PATH, 'utf8'))
    } catch (err) {
      throw new Error(`serviceAccountKey.json is invalid: ${err.message}`)
    }
  }

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!encoded) {
    throw new Error(
      'Firebase credentials not found: place serviceAccountKey.json in server/config/ ' +
      'or set FIREBASE_SERVICE_ACCOUNT_JSON (base64-encoded JSON)'
    )
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid: ${err.message}`)
  }
}

function initFirebase () {
  if (admin.apps.length > 0) {
    return
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const serviceAccount = loadServiceAccount()

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: projectId || serviceAccount.project_id
  })
}

module.exports = {
  initFirebase,
  admin
}
