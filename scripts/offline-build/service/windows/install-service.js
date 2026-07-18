// UNVERIFIED — written from node-windows' documented API, not yet tested
// on real Windows hardware (no Windows machine available while building
// this). Needs verification before being trusted; see
// DEPLOYMENT_ARCHITECTURE.md section 15. Run once, as Administrator
// (needed for both service registration and the firewall rule), using the
// bundled node.exe from the release: node.exe install-service.js
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Service } = require('node-windows')

const releaseDir = __dirname
const svc = new Service({
  name: 'ReportCardSystem',
  description: 'ReportCard System — offline school report card server',
  script: path.join(releaseDir, 'service-wrapper.js'),
})

// The service runs as LocalSystem; the desktop shortcut runs as whichever
// standard user is logged in (see appData.ts's getAppDataDir comment for
// why both must agree on %ProgramData%). %ProgramData%'s default ACL only
// grants standard users Read & Execute, not write — so if the service
// isn't running when the desktop shortcut is clicked (and it tries to spawn
// its own instance), a non-admin user would otherwise fail to create
// logs/config/db there. Fix it once, here, while this script still has the
// admin rights the installer's elevation gave it — *S-1-5-32-545 is the
// well-known, locale-independent SID for the built-in "Users" group.
function ensureAppDataWritable() {
  const appDataDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'ReportCardSystem')
  try {
    fs.mkdirSync(appDataDir, { recursive: true })
    execFileSync('icacls', [appDataDir, '/grant', '*S-1-5-32-545:(OI)(CI)M', '/T'])
    console.log('Granted standard users write access to the ProgramData app folder.')
  } catch (err) {
    console.error('Could not set ProgramData permissions — app may fail to write data if the service is ever stopped.', err.message)
  }
}

svc.on('install', () => {
  console.log('Service installed, starting...')
  svc.start()
})
svc.on('start', () => {
  console.log('Service started.')
  addFirewallRules()
})
// Hit on every UPDATE (this script re-runs post-install every time, and the
// service is already registered from the previous version) — the
// installer's [Code] PrepareToInstall step stops the service before files
// are overwritten, so it needs an explicit start here or the school is left
// with an updated build on disk but nothing actually running until the
// machine next reboots.
svc.on('alreadyinstalled', () => {
  console.log('Service already installed — restarting with the updated files.')
  svc.start()
})

function addFirewallRules() {
  // Private network only — this machine is meant to be reachable by other
  // devices on the school's own LAN, not the public internet.
  for (const [name, port] of [['ReportCardSystem Web', 3000], ['ReportCardSystem API', 5000]]) {
    try {
      execFileSync('netsh', [
        'advfirewall', 'firewall', 'add', 'rule',
        `name=${name}`, 'dir=in', 'action=allow', 'profile=private',
        'protocol=TCP', `localport=${port}`,
      ])
      console.log(`Firewall rule added for port ${port}.`)
    } catch (err) {
      console.error(`Could not add firewall rule for port ${port} — you may need to add it manually.`, err.message)
    }
  }
}

ensureAppDataWritable()
svc.install()
