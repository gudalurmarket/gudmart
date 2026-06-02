/**
 * Copy farmer-frontend/dist into farmer-backend/public for local unified-server runs.
 * Production Docker image copies dist in the Dockerfile — this script is for dev only.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')
const distDir = join(repoRoot, 'farmer-frontend/dist')
const publicDir = join(repoRoot, 'farmer-backend/public')

if (!existsSync(distDir)) {
  console.error('Missing farmer-frontend/dist — run: cd farmer-frontend && npm run build')
  process.exit(1)
}

if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true })
}
mkdirSync(publicDir, { recursive: true })
cpSync(distDir, publicDir, { recursive: true })
console.log(`Copied ${distDir} → ${publicDir}`)
