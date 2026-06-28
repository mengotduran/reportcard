import { spawn } from 'node:child_process'
import fs from 'node:fs'

// "App mode" — a chromeless window (no address bar/tabs) using whichever
// Chromium-family browser is already on the machine, so the school sees
// something that looks like a native app rather than "a website". Falls
// back to a normal browser tab if none of those are installed.
const CHROMIUM_CANDIDATES: Record<NodeJS.Platform | 'default', string[]> = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'],
  default: [],
} as any

function findChromiumBrowser(): string | null {
  const candidates = CHROMIUM_CANDIDATES[process.platform] ?? []
  for (const candidate of candidates) {
    // Absolute paths (win32/darwin): check the file exists. Bare names
    // (linux): let the shell's PATH lookup decide, can't stat those.
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (fs.existsSync(candidate)) return candidate
    } else {
      return candidate
    }
  }
  return null
}

export function openAppWindow(url: string): void {
  const browser = findChromiumBrowser()
  if (browser) {
    spawn(browser, [`--app=${url}`], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  // No Chromium-family browser found — fall back to a normal tab in
  // whatever the OS default browser is.
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}
