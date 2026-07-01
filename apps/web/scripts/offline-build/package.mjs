// Builds the web app for the offline install using Next's own "standalone"
// output (its official minimal-dependency deployment mode) — NOT a Node SEA
// executable like the API. Next's request pipeline dynamically loads
// per-route compiled chunks from .next at runtime; forcing that into a
// single-file SEA bundle isn't something Next supports, and standalone mode
// already solves the same underlying problem (run without `npm install` on
// the target machine) in a way Next actually ships and tests.
//
// Usage: node scripts/offline-build/package.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { targetExeName, resolveNodeBinary } from '../../../../scripts/offline-build/target-node-binary.mjs'

const webRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const releaseDir = path.join(webRoot, 'release')
// "next-build", not the default ".next" — see next.config.ts's distDir
// comment: Wine (used to compile the Windows installer on this Linux dev
// machine) auto-marks dot-prefixed files/folders as Hidden, and Inno
// Setup's wildcard [Files] source silently skips hidden files, so a
// dot-prefixed build output went missing from real Windows installs.
const distDirName = 'next-build'
const standaloneDir = path.join(webRoot, distDirName, 'standalone')
const nodeBinaryName = targetExeName('node')

// This is a monorepo (Turborepo/npm workspaces) — Next's standalone tracer
// mirrors the workspace path inside the output (apps/web/server.js, not
// server.js at the root), and its own docs say to copy `public`/`.next/static`
// into that nested app folder by hand, not the standalone root.
const appSubpath = 'apps/web'

function run(cmd, args, env) {
  console.log('>', cmd, args.join(' '))
  execFileSync(cmd, args, { cwd: webRoot, stdio: 'inherit', env: { ...process.env, ...env } })
}

// 1. Build with standalone output. NEXT_PUBLIC_API_URL is explicitly set to
// an empty string (not just omitted) — Next's env loader only fills in a
// value from .env.local when the var isn't already set in process.env, and
// apps/web/.env.local sets it for normal dev builds. An empty string is
// "already set" (so .env.local's value is skipped) but falsy in app code
// (so lib/api/client.ts correctly falls through to runtime detection).
run('npx', ['next', 'build'], { OFFLINE_BUILD: '1', NEXT_PUBLIC_API_URL: '', NEXT_PUBLIC_OFFLINE_BUILD: '1' })

if (!fs.existsSync(standaloneDir)) {
  throw new Error(`Expected standalone output at ${standaloneDir} — did the build actually run with OFFLINE_BUILD=1?`)
}

// 2. Assemble the release folder. Standalone's dependency tracing doesn't
// include static assets or the public folder — Next's own docs say to copy
// these into the nested apps/web folder, not the standalone root.
fs.rmSync(releaseDir, { recursive: true, force: true })
fs.cpSync(standaloneDir, releaseDir, { recursive: true })
const appDir = path.join(releaseDir, appSubpath)
if (!fs.existsSync(path.join(appDir, 'server.js'))) {
  throw new Error(`Expected ${path.join(appDir, 'server.js')} to exist — check appSubpath matches the workspace path`)
}
fs.cpSync(path.join(webRoot, distDirName, 'static'), path.join(appDir, distDirName, 'static'), { recursive: true })
if (fs.existsSync(path.join(webRoot, 'public'))) {
  fs.cpSync(path.join(webRoot, 'public'), path.join(appDir, 'public'), { recursive: true })
}

// 3. Bundle a copy of the TARGET platform's node runtime so the target
// machine doesn't need Node.js installed — same idea as the API's SEA
// executable, simpler mechanism (standalone's server.js is plain enough to
// just interpret).
fs.copyFileSync(await resolveNodeBinary(), path.join(releaseDir, nodeBinaryName))
fs.chmodSync(path.join(releaseDir, nodeBinaryName), 0o755)

console.log(`\nRelease built at ${releaseDir}`)
console.log(`Run with: cd release && PORT=3000 ./${nodeBinaryName} ${appSubpath}/server.js`)
