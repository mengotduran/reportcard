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
// needs the service stopped BEFORE [Files] copies anything: Windows locks
// the executable files a running process holds open, so overwriting
// reportcard-api.exe/reportcard-launcher.exe/web\node.exe etc. while the
// service is still running them would fail outright. PrepareToInstall runs
// right before file extraction — the correct hook for this, as opposed to
// [Run] entries, which only fire AFTER installation completes.
//
// `net stop` exits non-zero on a first-time install (service doesn't exist
// yet) or if it's already stopped — both fine, deliberately ignored rather
// than treated as a Result error message, which would abort Setup entirely.
// install-service.js's `alreadyinstalled` handler starts it again once the
// new files are in place; %ProgramData% (the database + uploads) is never
// touched by any of this.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  Exec('net.exe', 'stop ReportCardSystem', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
