// node-windows wraps a JS *script* run by `node.exe`, not an arbitrary
// native .exe directly — this tiny wrapper is that script. It just execs
// our actual launcher in --service mode and inherits its stdio, so
// node-windows' bundled WinSW process is the only thing talking to the
// Windows Service Control Manager; everything else is identical to the
// other platforms.
// Ships at release/windows/service-wrapper.js, one level below the
// launcher at release/reportcard-launcher.exe (see assemble-release.mjs).
const path = require('node:path')
const { spawn } = require('node:child_process')

const launcher = path.join(__dirname, '..', 'reportcard-launcher.exe')

const child = spawn(launcher, ['--service'], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
