// Orchestrates the full offline install build: API package, web package,
// launcher, combined into one release/ folder at the repo root.
//
//   release/
//     reportcard-launcher(.exe)   <- what the desktop shortcut points at
//     api/reportcard-api(.exe) + node_modules/
//     web/apps/web/server.js + node(.exe) + ...
//
// Usage: node scripts/offline-build/assemble-release.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLauncher } from './build-launcher.mjs'

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const apiDir = path.join(repoRoot, 'apps/api')
const webDir = path.join(repoRoot, 'apps/web')
const releaseDir = path.join(repoRoot, 'release')
const serviceScriptsDir = path.join(repoRoot, 'scripts/offline-build/service')

function run(cwd, cmd, args) {
  console.log(`\n=== ${cmd} ${args.join(' ')} (cwd: ${path.relative(repoRoot, cwd)}) ===`)
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

run(apiDir, process.execPath, ['scripts/offline-build/package.mjs'])
run(webDir, process.execPath, ['scripts/offline-build/package.mjs'])
const launcherExe = await buildLauncher()

fs.rmSync(releaseDir, { recursive: true, force: true })
fs.mkdirSync(releaseDir, { recursive: true })
fs.cpSync(path.join(apiDir, 'release'), path.join(releaseDir, 'api'), { recursive: true })
fs.cpSync(path.join(webDir, 'release'), path.join(releaseDir, 'web'), { recursive: true })
const launcherName = path.basename(launcherExe)
fs.copyFileSync(launcherExe, path.join(releaseDir, launcherName))
fs.chmodSync(path.join(releaseDir, launcherName), 0o755)

fs.cpSync(serviceScriptsDir, releaseDir, { recursive: true })
// chmod everything that looks like a script — cpSync doesn't preserve the
// executable bit reliably across all platforms/filesystems. Scoped to just
// what was copied from serviceScriptsDir, not the whole release tree.
for (const entry of fs.readdirSync(serviceScriptsDir, { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && /\.(sh|js)$/.test(entry.name)) {
    fs.chmodSync(path.join(releaseDir, path.relative(serviceScriptsDir, entry.parentPath), entry.name), 0o755)
  }
}

// install-service.js/uninstall-service.js (Windows only) need node-windows
// at runtime, plus ITS OWN dependencies (xml, yargs, ...) — those are
// hoisted to the workspace root here, not nested under node_modules/
// node-windows/, so just copying that one folder would silently miss them.
// A clean isolated install (own node_modules, npm resolves everything
// self-contained) avoids having to hand-track node-windows' dependency
// tree, same idea as the API's better-sqlite3 packaging.
const nodeWindowsWorkDir = path.join(repoRoot, 'scripts/offline-build/.node-windows-install')
fs.rmSync(nodeWindowsWorkDir, { recursive: true, force: true })
fs.mkdirSync(nodeWindowsWorkDir, { recursive: true })
fs.writeFileSync(path.join(nodeWindowsWorkDir, 'package.json'), '{"name":"node-windows-install","private":true}')
run(nodeWindowsWorkDir, 'npm', ['install', 'node-windows', '--omit=dev'])
fs.cpSync(
  path.join(nodeWindowsWorkDir, 'node_modules'),
  path.join(releaseDir, 'windows/node_modules'),
  { recursive: true }
)

console.log(`\nCombined release built at ${releaseDir}`)
console.log(`Run with: ./release/${launcherName}`)
