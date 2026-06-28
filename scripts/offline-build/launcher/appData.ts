import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const APP_DIR_NAME = 'ReportCardSystem'

// Standard per-OS data folder — survives reinstalls/updates, follows OS
// convention rather than inventing our own location.
//
// Windows is deliberately machine-wide (%ProgramData%), NOT per-user
// (%APPDATA%): the Windows Service runs as LocalSystem, whose "home" is a
// totally different profile (systemprofile) than the interactive user who
// clicks the desktop shortcut. Pointing both at the same per-user folder
// silently split them into two unrelated installs (service wins the port
// race, desktop shortcut/user only ever sees the unused profile's data —
// see DEPLOYMENT_ARCHITECTURE.md section 15 Bug 2). %ProgramData% is the
// same path regardless of which account is asking, mirroring why
// Linux/macOS never hit this: the systemd user service and the LaunchAgent
// both already run as the actual logged-in user, not a separate system
// account, so os.homedir() already matched there.
export function getAppDataDir(): string {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramData ?? 'C:\\ProgramData', APP_DIR_NAME)
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME)
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), APP_DIR_NAME)
}

export interface AppConfig {
  jwtSecret: string
  superadminSecret: string
}

const CONFIG_FILE = 'config.json'

// Secrets are generated ONCE on first run and reused forever after — if we
// regenerated them every launch, every existing login's JWT would become
// invalid on every restart, and the original superadmin bootstrap secret
// would be lost.
export function loadOrCreateConfig(appDataDir: string): AppConfig {
  const configPath = path.join(appDataDir, CONFIG_FILE)
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }
  const config: AppConfig = {
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    superadminSecret: crypto.randomBytes(24).toString('hex'),
  }
  fs.mkdirSync(appDataDir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  return config
}
