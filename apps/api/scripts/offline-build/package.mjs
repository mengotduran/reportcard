// Produces a standalone offline-build release folder:
//   release/
//     reportcard-api(.exe)      <- single executable (Node SEA)
//     node_modules/             <- only the native deps the shim needs
//       better-sqlite3/ bindings/ file-uri-to-path/
//
// Set TARGET_PLATFORM=win32 to cross-build a Windows release from any host
// — see ../../../scripts/offline-build/target-node-binary.mjs for why this
// can't just copy process.execPath (that's the host's own binary, not
// necessarily Windows').
//
// Usage: node scripts/offline-build/package.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGET_PLATFORM, targetExeName, resolveNodeBinary } from '../../../../scripts/offline-build/target-node-binary.mjs'

const apiRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const rootNodeModules = path.resolve(apiRoot, '../../node_modules')
const releaseDir = path.join(apiRoot, 'release')
const distOffline = path.join(apiRoot, 'dist-offline')
const exeName = targetExeName('reportcard-api')

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
const NATIVE_DEPS = ['better-sqlite3', 'bindings', 'file-uri-to-path']

function run(cmd, args, env, cwd = apiRoot) {
  console.log('>', cmd, args.join(' '))
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
}

fs.mkdirSync(distOffline, { recursive: true })
fs.rmSync(releaseDir, { recursive: true, force: true })
fs.mkdirSync(path.join(releaseDir, 'node_modules'), { recursive: true })

// 1. Bundle src/index.ts (with the offline swaps) into one CJS file.
run(process.execPath, [path.join(apiRoot, 'scripts/offline-build/bundle.mjs')])

// 2. Generate the SEA blob from that bundle.
run(process.execPath, [
  '--experimental-sea-config',
  path.join(apiRoot, 'scripts/offline-build/sea-config.json'),
])

// 3. Copy the TARGET platform's node binary and inject the blob into it.
const exePath = path.join(releaseDir, exeName)
fs.copyFileSync(await resolveNodeBinary(), exePath)
fs.chmodSync(exePath, 0o755)
run('npx', [
  'postject',
  exePath,
  'NODE_SEA_BLOB',
  path.join(distOffline, 'sea-prep.blob'),
  '--sentinel-fuse',
  SENTINEL_FUSE,
])

// 4. Copy the native deps the shim resolves via createRequire(process.execPath).
// better-sqlite3 has a compiled native addon — when cross-building, the
// host's own node_modules has the HOST's binary, not the target's, so do a
// clean install with the target platform/arch forced instead of copying.
if (TARGET_PLATFORM === process.platform) {
  for (const dep of NATIVE_DEPS) {
    copyDir(path.join(rootNodeModules, dep), path.join(releaseDir, 'node_modules', dep))
  }
} else {
  const archForTarget = { win32: 'x64' }[TARGET_PLATFORM] ?? process.arch
  const workDir = path.join(apiRoot, 'scripts/offline-build/.cross-install')
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  fs.writeFileSync(path.join(workDir, 'package.json'), '{"name":"cross-install","private":true}')
  run(
    'npm',
    ['install', 'better-sqlite3', '--omit=dev'],
    { npm_config_platform: TARGET_PLATFORM, npm_config_arch: archForTarget },
    workDir
  )
  for (const dep of NATIVE_DEPS) {
    copyDir(path.join(workDir, 'node_modules', dep), path.join(releaseDir, 'node_modules', dep))
  }
}

console.log(`\nRelease built at ${releaseDir}`)
