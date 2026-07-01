// Bundles the API into a single CJS file for the offline (SQLite) build.
// Same src/index.ts and all controllers/routes, completely unmodified —
// the only swap is config/prisma -> config/prisma.sqlite, done here via an
// esbuild resolve plugin rather than touching application source.
//
// better-sqlite3 is a native addon and can't be bundled into the JS file —
// redirected to a shim that loads it via createRequire() at runtime instead
// (a Node SEA executable's embedded require() can't do node_modules
// resolution at all; see shims/better-sqlite3.shim.js). The actual .node
// binary + its JS deps are copied alongside the executable by package.mjs.
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = path.resolve(fileURLToPath(import.meta.url), '../../../')
const pgConfigPath = path.join(apiRoot, 'src/config/prisma.ts')
const sqliteConfigPath = path.join(apiRoot, 'src/config/prisma.sqlite.ts')
const demoRoutesPath = path.join(apiRoot, 'src/routes/demo.routes.ts')
const demoRoutesStub = path.join(apiRoot, 'scripts/offline-build/stubs/demo.routes.stub.ts')
const backupRoutesPath = path.join(apiRoot, 'src/routes/backup.routes.ts')
const backupRoutesOffline = path.join(apiRoot, 'scripts/offline-build/stubs/backup.routes.offline.ts')
const betterSqlite3Shim = path.join(apiRoot, 'scripts/offline-build/shims/better-sqlite3.shim.js')

// Redirects a handful of imports to offline-only equivalents, purely at
// build time — src/index.ts and the controllers are never touched.
const offlineSwaps = {
  name: 'offline-build-swaps',
  setup(buildApi) {
    buildApi.onResolve({ filter: /config\/prisma$/ }, async (args) => {
      const resolved = path.resolve(args.resolveDir, args.path)
      if (resolved === pgConfigPath.replace(/\.ts$/, '')) {
        return { path: sqliteConfigPath }
      }
      return null
    })
    buildApi.onResolve({ filter: /routes\/demo\.routes$/ }, async (args) => {
      const resolved = path.resolve(args.resolveDir, args.path)
      if (resolved === demoRoutesPath.replace(/\.ts$/, '')) {
        return { path: demoRoutesStub }
      }
      return null
    })
    buildApi.onResolve({ filter: /routes\/backup\.routes$/ }, async (args) => {
      const resolved = path.resolve(args.resolveDir, args.path)
      if (resolved === backupRoutesPath.replace(/\.ts$/, '')) {
        return { path: backupRoutesOffline }
      }
      return null
    })
    buildApi.onResolve({ filter: /^better-sqlite3$/ }, () => ({ path: betterSqlite3Shim }))
  },
}

await build({
  entryPoints: [path.join(apiRoot, 'src/index.ts')],
  outfile: path.join(apiRoot, 'dist-offline/server.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  plugins: [offlineSwaps],
  loader: { '.sql': 'text' },
  logLevel: 'info',
  // Obfuscate the bundled source so the SEA blob is not human-readable if
  // someone extracts it. Does not affect runtime behaviour at all.
  minify: true,
  minifyIdentifiers: true,
  minifySyntax: true,
})

console.log('Offline bundle written to dist-offline/server.js')
