// UNVERIFIED — see install-service.js. Run as Administrator:
// node.exe uninstall-service.js
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Service } = require('node-windows')

const svc = new Service({
  name: 'ReportCardSystem',
  script: path.join(__dirname, 'service-wrapper.js'),
})

svc.on('uninstall', () => {
  console.log('Service uninstalled. Your data is untouched.')
  for (const name of ['ReportCardSystem Web', 'ReportCardSystem API']) {
    try {
      execFileSync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`])
    } catch {
      // Rule may not exist — fine either way.
    }
  }
})

svc.uninstall()
