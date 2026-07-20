; Wraps the release/ folder (api/web/launcher/service scripts) into one
; installer .exe: Inno Setup compiler is Windows-only, compiled here via
; Wine — see DEPLOYMENT_ARCHITECTURE.md section 16.
#define MyAppName "ReportCard System"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "ReportCard System"

[Setup]
AppId={{016F6F7E-9976-4062-937C-77A53EE7D837}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ReportCardSystem
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\..\installer-output
OutputBaseFilename=ReportCardSystemSetup
Compression=lzma
SolidCompression=yes
; Installing a service + firewall rule + writing to Program Files all need
; elevation — this triggers the standard one-time Windows UAC prompt.
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\..\release\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\reportcard-launcher.exe"
Name: "{group}\{#MyAppName}"; Filename: "{app}\reportcard-launcher.exe"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Run]
; Registers + starts the Windows Service and adds the firewall rule (see
; service/windows/install-service.js) — runs node.exe from the web release
; rather than bundling yet another copy just for this one script.
; Deliberately NOT runhidden: node-windows writes to stdout internally
; (winsw.js's generateXml), and a hidden child process can end up with
; invalid stdio handles (EBADF) — found by actually running this under
; Wine, not assumed. A brief console flash during this one-time setup
; step is a fine tradeoff over a silent failure.
Filename: "{app}\web\node.exe"; Parameters: """{app}\windows\install-service.js"""; WorkingDir: "{app}\windows"; StatusMsg: "Setting up the background service..."; Flags: waituntilterminated
; Standard "Launch now" checkbox on the finish page — opens the app-mode
; browser window, same as double-clicking the desktop icon afterward.
Filename: "{app}\reportcard-launcher.exe"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Must run BEFORE files are removed (RunOnceId + default ordering handles
; this) — stops the service and removes the firewall rule cleanly rather
; than leaving an orphaned service pointing at deleted files.
Filename: "{app}\web\node.exe"; Parameters: """{app}\windows\uninstall-service.js"""; WorkingDir: "{app}\windows"; Flags: waituntilterminated; RunOnceId: "UninstallService"

[Code]
// Re-running this installer over an existing install (an UPDATE — same
// AppId above, so Setup treats it as an upgrade, not a parallel install)
// needs every running instance of the app's own executables gone BEFORE
// [Files] copies anything: Windows locks the executable files a running
// process holds open, so overwriting reportcard-api.exe/
// reportcard-launcher.exe/web\node.exe etc. while any of them are still
// running would fail outright. PrepareToInstall runs right before file
// extraction — the correct hook for this, as opposed to [Run] entries,
// which only fire AFTER installation completes.
//
// Real bug found on actual Windows hardware, not assumed: `net stop`
// alone (the original version of this function) reliably left
// reportcard-launcher.exe still holding its own file locked — "DeleteFile
// failed; code 5. Access is denied" on every single update. `net stop`
// only guarantees the SCM-registered top-level process is asked to stop;
// it does not guarantee node-windows' service wrapper actually kills the
// full process tree it spawned (reportcard-launcher.exe --service, and
// in turn reportcard-api.exe and web's node.exe as ITS children), and it
// does nothing at all for a separate instance someone launched via the
// desktop shortcut rather than the service. Fixed by force-killing the
// app's own executables by name afterward, with /T (tree-kill, so each
// process's own children go with it — no need to also target node.exe by
// name directly, which could over-match unrelated processes on the
// machine) — a stronger guarantee than trusting `net stop` alone.
//
// Non-zero exit codes from any of these are expected and ignored (no
// service yet on a first-time install, nothing running to kill, etc.) —
// deliberately never surfaced as a Result error, which would abort Setup
// entirely over a condition that just means "already in the state we
// want." install-service.js's `alreadyinstalled` handler starts the
// service again once the new files are in place; %ProgramData% (the
// database + uploads) is never touched by any of this.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  Exec('net.exe', 'stop ReportCardSystem', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM reportcard-launcher.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM reportcard-api.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // Killing a process doesn't guarantee Windows has fully released its file
  // handles by the very next instruction — observed lock contention
  // clearing within a second or two in practice; 2s is a cheap, generous
  // margin for a one-time update step.
  Sleep(2000);
end;
