// Bundles + packages the launcher as a Node SEA executable. Unlike the API,
// the launcher has zero native dependencies (just child_process/fs/path/http,
// all built-ins), so this is much simpler — no createRequire shim, no
// node_modules to ship alongside.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { targetExeName, resolveNodeBinary } from './target-node-binary.mjs'

const offlineBuildRoot = path.resolve(fileURLToPath(import.meta.url), '../')
const distDir = path.join(offlineBuildRoot, 'dist-launcher')
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

export async function buildLauncher() {
  fs.mkdirSync(distDir, { recursive: true })

  await build({
    entryPoints: [path.join(offlineBuildRoot, 'launcher/index.ts')],
    outfile: path.join(distDir, 'launcher.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'info',
  })

  fs.writeFileSync(
    path.join(distDir, 'sea-config.json'),
    JSON.stringify({ main: 'launcher.js', output: 'sea-prep.blob', disableExperimentalSEAWarning: true }, null, 2)
  )
  execFileSync(process.execPath, ['--experimental-sea-config', 'sea-config.json'], { cwd: distDir, stdio: 'inherit' })

  const exeName = targetExeName('reportcard-launcher')
  const exePath = path.join(distDir, exeName)
  fs.copyFileSync(await resolveNodeBinary(), exePath)
  fs.chmodSync(exePath, 0o755)
  execFileSync(
    'npx',
    ['postject', exePath, 'NODE_SEA_BLOB', path.join(distDir, 'sea-prep.blob'), '--sentinel-fuse', SENTINEL_FUSE],
    { cwd: offlineBuildRoot, stdio: 'inherit' }
  )

  return exePath
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildLauncher().then((exePath) => console.log(`\nLauncher built at ${exePath}`))
}
