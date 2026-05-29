/**
 * One-time CLI: create a Firebase Auth user and set custom claim { role }.
 * Run from farmer-backend: npm run create-user -- --email ... --password ... --role ...
 */
import 'dotenv/config'

import admin from 'firebase-admin'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const args = process.argv.slice(2)

function getFlag(name) {
  const prefix = `${name}=`
  for (const arg of args) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length)
    }
  }
  const i = args.indexOf(name)
  if (i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
    return args[i + 1]
  }
  return null
}

let email = getFlag('--email')
let password = getFlag('--password')
let role = getFlag('--role')

// npm on Windows often strips --flag names and forwards only values; accept positional order.
if (!email && !password && !role && args.length === 3 && !args.some((a) => a.startsWith('--'))) {
  ;[email, password, role] = args
}

if (!email || !password || !role) {
  console.error(
    'Usage: node scripts/create-user.mjs --email <email> --password <password> --role <operator|volunteer>'
  )
  console.error('       node scripts/create-user.mjs <email> <password> <role>')
  console.error('       (forms like --email=value are also accepted)')
  console.error('')
  console.error('PowerShell: quote passwords containing & — e.g. --password "Gudalur1&b2c"')
  console.error('On Windows, prefer: node scripts/create-user.mjs ... (avoids npm swallowing --flags)')
  process.exit(1)
}

if (!['operator', 'volunteer'].includes(role)) {
  console.error('Role must be either "operator" or "volunteer"')
  process.exit(1)
}

function loadServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (encoded) {
    try {
      if (encoded.startsWith('{')) {
        return JSON.parse(encoded)
      }
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const parsed = JSON.parse(decoded)
      if (parsed.type === 'service_account' && parsed.private_key) {
        return parsed
      }
      throw new Error('decoded value is not a service account JSON object')
    } catch (err) {
      console.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON ignored (invalid); trying local serviceAccountKey.json:',
        err.message
      )
    }
  }

  const localPaths = [
    resolve(process.cwd(), 'server/config/serviceAccountKey.json'),
    resolve(process.cwd(), 'serviceAccountKey.json')
  ]
  for (const jsonPath of localPaths) {
    if (!existsSync(jsonPath)) continue
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf8'))
    } catch (err) {
      console.error(`${jsonPath} is invalid:`, err.message)
      process.exit(1)
    }
  }

  console.error('Could not load Firebase credentials.')
  console.error(
    'Set FIREBASE_SERVICE_ACCOUNT_JSON (base64-encoded full service account JSON) or place serviceAccountKey.json in server/config/ or project root.'
  )
  process.exit(1)
}

const serviceAccount = loadServiceAccount()

const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId
  })
}

try {
  const user = await admin.auth().createUser({ email, password })
  await admin.auth().setCustomUserClaims(user.uid, { role })
  console.log('✓ User created successfully')
  console.log(`  Email: ${email}`)
  console.log(`  UID:   ${user.uid}`)
  console.log(`  Role:  ${role}`)
  process.exit(0)
} catch (err) {
  console.error('✗ Failed to create user:', err.message)
  process.exit(1)
}
