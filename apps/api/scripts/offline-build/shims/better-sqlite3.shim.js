// A Node SEA executable's embedded require() only resolves built-ins, not
// node_modules on disk — native addons must be loaded via createRequire()
// bound to a real filesystem path instead (process.execPath: the directory
// the executable itself lives in, where its node_modules sit alongside it).
// Deliberately NOT `require('better-sqlite3')` directly — esbuild must not
// try to bundle this; resolution has to happen at runtime, in the package.mjs.
const { createRequire } = require('node:module')
const req = createRequire(process.execPath)
module.exports = req('better-sqlite3')
