// Resolves the Node binary to bundle/inject-into for a given TARGET_PLATFORM
// (defaults to the host's own platform). Building on Linux for Linux uses
// process.execPath directly (fast path, no download) — building for win32
// from any host downloads Node's own official prebuilt node.exe and caches
// it, since copying process.execPath would silently produce a Linux ELF
// binary mislabeled with a .exe extension (this is the bug step 6 caught:
// the installer extracted fine, then failed to run "node.exe" at all).
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const cacheDir = path.resolve(fileURLToPath(import.meta.url), '../.cache')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} -> ${res.statusCode}`))
        return
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    }).on('error', reject)
  })
}

export const TARGET_PLATFORM = process.env.TARGET_PLATFORM || process.platform

export function targetExeName(baseName) {
  return TARGET_PLATFORM === 'win32' ? `${baseName}.exe` : baseName
}

export async function resolveNodeBinary() {
  if (TARGET_PLATFORM === process.platform) {
    return process.execPath
  }
  if (TARGET_PLATFORM !== 'win32') {
    throw new Error(`Cross-building for ${TARGET_PLATFORM} from ${process.platform} isn't set up — only win32 is.`)
  }
  const version = process.version // e.g. v24.15.0
  fs.mkdirSync(cacheDir, { recursive: true })
  const cached = path.join(cacheDir, `node-${version}-win-x64.exe`)
  if (!fs.existsSync(cached)) {
    const url = `https://nodejs.org/dist/${version}/win-x64/node.exe`
    console.log(`Downloading Windows node binary: ${url}`)
    await download(url, cached)
  }
  return cached
}
