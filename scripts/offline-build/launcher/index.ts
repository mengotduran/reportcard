import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { getAppDataDir, loadOrCreateConfig } from './appData'
import { openAppWindow } from './browser'

const API_PORT = Number(process.env.RC_API_PORT) || 5000
const WEB_PORT = Number(process.env.RC_WEB_PORT) || 3000
const WEB_URL = `http://localhost:${WEB_PORT}`

// __dirname is unreliable inside a Node SEA executable (collapses to "/" —
// see DEPLOYMENT_ARCHITECTURE.md section 12) — resolve relative to the
// executable's own location instead. release/ layout:
//   reportcard-launcher(.exe)
//   api/reportcard-api(.exe) + node_modules/
//   web/apps/web/server.js + node(.exe)
const releaseDir = path.dirname(process.execPath)
const apiExe = path.join(releaseDir, 'api', process.platform === 'win32' ? 'reportcard-api.exe' : 'reportcard-api')
const webNode = path.join(releaseDir, 'web', process.platform === 'win32' ? 'node.exe' : 'node')
const webServer = path.join(releaseDir, 'web', 'apps', 'web', 'server.js')

function checkUp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', timeout: 1000 }, (res) => {
      res.destroy()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function waitUntilUp(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkUp(port)) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

function openLog(appDataDir: string, name: string) {
  const logsDir = path.join(appDataDir, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  return fs.openSync(path.join(logsDir, `${name}.log`), 'a')
}

function apiSpawnArgs(appDataDir: string) {
  const config = loadOrCreateConfig(appDataDir)
  const dbPath = path.join(appDataDir, 'data.db')
  const uploadDir = path.join(appDataDir, 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
  return {
    cmd: apiExe,
    args: [] as string[],
    env: {
      ...process.env,
      PORT: String(API_PORT),
      DATABASE_URL: `file:${dbPath}`,
      UPLOAD_DIR: uploadDir,
      JWT_SECRET: config.jwtSecret,
      SUPERADMIN_SECRET: config.superadminSecret,
    },
  }
}

function webSpawnArgs() {
  return {
    cmd: webNode,
    args: [webServer],
    cwd: path.dirname(webServer),
    env: { ...process.env, PORT: String(WEB_PORT), HOSTNAME: '0.0.0.0' },
  }
}

// ---------------------------------------------------------------------------
// Desktop-shortcut mode (default, no flag): fire-and-forget. Fine for a
// shortcut the user double-clicks — if a system service (see --service
// below) already started the servers, checkUp() finds them and this does
// nothing but open the browser. If no service exists (not installed, or
// this is a quick manual run), it starts them itself, detached, so they
// outlive this process once it exits.
async function ensureApiRunning(appDataDir: string) {
  if (await checkUp(API_PORT)) return
  const { cmd, args, env } = apiSpawnArgs(appDataDir)
  const log = openLog(appDataDir, 'api')
  spawn(cmd, args, { detached: true, stdio: ['ignore', log, log], env }).unref()
}

async function ensureWebRunning(appDataDir: string) {
  if (await checkUp(WEB_PORT)) return
  const { cmd, args, cwd, env } = webSpawnArgs()
  const log = openLog(appDataDir, 'web')
  spawn(cmd, args, { detached: true, stdio: ['ignore', log, log], cwd, env }).unref()
}

async function runShortcut() {
  const appDataDir = getAppDataDir()
  fs.mkdirSync(appDataDir, { recursive: true })

  await ensureApiRunning(appDataDir)
  await ensureWebRunning(appDataDir)

  const ready = await waitUntilUp(WEB_PORT, 30_000)
  if (!ready) {
    fs.writeFileSync(
      path.join(appDataDir, 'logs', 'launcher-error.log'),
      `Web server did not respond within 30s at ${new Date().toISOString()}. Check web.log and api.log in this folder.\n`
    )
    // Still try opening the browser — the user gets a clear connection
    // error rather than nothing happening at all when they click the icon.
  }
  openAppWindow(WEB_URL)
}

// ---------------------------------------------------------------------------
// Service mode (--service): what systemd / the Windows Service / the
// macOS LaunchAgent actually runs. Stays alive supervising both children
// directly (not detached — they're real children of this process, so the
// service manager's view of "is this unit running" reflects reality), and
// restarts a child if it crashes. Never opens a browser — this runs before
// any user logs in, often with no display server available at all.
// Deliberately NOT reimplementing retry/backoff/give-up here — systemd
// (Restart=on-failure + RestartSec, and StartLimitBurst as the outer
// give-up threshold) already does this well, and a service manager's view
// of "is this unit healthy" needs to match whether *this* process is alive.
// First version tried to retry children internally; once both children
// exhausted their own retry budget, nothing was left keeping this process'
// event loop alive, so it exited with status 0 ("success") — which told
// systemd the service finished cleanly and it never restarted. Simpler and
// correct: if either child dies, kill the other and exit non-zero, so
// systemd's own restart logic (which already exists and is well-tested)
// is the only supervisor.
function runService() {
  const appDataDir = getAppDataDir()
  fs.mkdirSync(appDataDir, { recursive: true })

  const apiLog = openLog(appDataDir, 'api')
  const webLog = openLog(appDataDir, 'web')
  const api = apiSpawnArgs(appDataDir)
  const web = webSpawnArgs()

  const apiChild = spawn(api.cmd, api.args, { stdio: ['ignore', apiLog, apiLog], env: api.env })
  const webChild = spawn(web.cmd, web.args, { stdio: ['ignore', webLog, webLog], cwd: web.cwd, env: web.env })

  let shuttingDown = false
  const shutdown = (reason: string) => {
    if (shuttingDown) return
    shuttingDown = true
    fs.writeSync(apiLog, `\n[supervisor] ${reason} — stopping the other process and exiting so systemd restarts the whole service\n`)
    apiChild.kill()
    webChild.kill()
    process.exitCode = 1
  }
  apiChild.on('exit', (code, signal) => shutdown(`api exited (code=${code}, signal=${signal})`))
  webChild.on('exit', (code, signal) => shutdown(`web exited (code=${code}, signal=${signal})`))
}

if (process.argv.includes('--service')) {
  runService()
} else {
  runShortcut()
}
