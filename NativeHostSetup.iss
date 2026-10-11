; YTDownloader - A browser addon for downloading videos from websites.
; Copyright (C) 2025-2026 dodekatos
;
; This program is free software: you can redistribute it and/or modify
; it under the terms of the GNU General Public License as published by
; the Free Software Foundation, either version 3 of the License, or
; (at your option) any later version.
;
; This program is distributed in the hope that it will be useful,
; but WITHOUT ANY WARRANTY; without even the implied warranty of
; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
; GNU General Public License for more details.
;
; You should have received a copy of the GNU General Public License
; along with this program.  If not, see <https://www.gnu.org/licenses/>.

; YTDownloader Native Host Installer
; Downloads Native Client (+ Updater) for Firefox native messaging, using
; Inno Setup's built-in downloader (requires Inno Setup 6.1 or newer).
; Has optional Windows Defender exclusions.

#define BaseUrl "https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/"

[Setup]
AppName=YTDownloader Native Host
AppVersion=0.6.1
AppPublisher=dodekatos
AppPublisherURL=https://github.com/dodekatos/YTDownloader
AppCopyright=Copyright (C) 2025-2026 dodekatos
VersionInfoVersion=0.0.6.1
VersionInfoProductVersion=0.6.1
VersionInfoCompany=dodekatos
VersionInfoDescription=YTDownloader Native Host Installer
VersionInfoProductName=YTDownloader
VersionInfoCopyright=Copyright (C) 2025-2026 dodekatos
DefaultDirName={commonappdata}\YTDownloader
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=native-client-setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=icon.ico

[Dirs]
Name: "{app}\bin"
Name: "{app}\native_host"

[Files]
; These four files are downloaded into {tmp} in the [Code] section before
; installation starts, then copied into place here.
Source: "{tmp}\ytdlp_host.exe";  DestDir: "{app}\native_host"; Flags: external ignoreversion; Tasks: install_nc
Source: "{tmp}\ytdlp_host.json"; DestDir: "{app}\native_host"; Flags: external ignoreversion; Tasks: install_nc
Source: "{tmp}\nc_updater.exe";  DestDir: "{app}\native_host"; Flags: external ignoreversion; Tasks: install_nc
Source: "{tmp}\nc_updater.json"; DestDir: "{app}\native_host"; Flags: external ignoreversion; Tasks: install_nc

[Registry]
; 64-bit Firefox Native Client (modern)
Root: HKCU64; Subkey: "Software\Mozilla\NativeMessagingHosts\ytdlp_host"; \
    ValueType: string; ValueName: ""; ValueData: "{app}\native_host\ytdlp_host.json"; Flags: uninsdeletekey
; 32-bit Firefox Native Client (fallback)
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\ytdlp_host"; \
    ValueType: string; ValueName: ""; ValueData: "{app}\native_host\ytdlp_host.json"; Flags: uninsdeletekey
; 64-bit Firefox Native Client Updater (modern)
Root: HKCU64; Subkey: "Software\Mozilla\NativeMessagingHosts\nc_updater"; \
    ValueType: string; ValueName: ""; ValueData: "{app}\native_host\nc_updater.json"; Flags: uninsdeletekey
; 32-bit Firefox Native Client Updater (fallback)
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\nc_updater"; \
    ValueType: string; ValueName: ""; ValueData: "{app}\native_host\nc_updater.json"; Flags: uninsdeletekey

[UninstallDelete]
Type: filesandordirs; Name: "{app}\native_host"

[Tasks]
Name: "install_nc"; Description: "Install Native Client"; GroupDescription: "Main components:"
Name: "whitelist_bin"; Description: "Whitelist in Windows Defender (asks for administrator permission)"; GroupDescription: "Optional components:"; Flags: unchecked

[Code]
var
  DownloadPage: TDownloadWizardPage;
  ExclusionsAdded: Boolean;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  Result := True; // keep going
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing),
    SetupMessage(msgPreparingDesc), @OnDownloadProgress);
end;

// Downloads the four files into {tmp} before installation starts.
function DownloadFiles: Boolean;
begin
  Result := False;
  DownloadPage.Clear;
  DownloadPage.Add('{#BaseUrl}ytdlp_host.exe', 'ytdlp_host.exe', '');
  DownloadPage.Add('{#BaseUrl}ytdlp_host.json', 'ytdlp_host.json', '');
  DownloadPage.Add('{#BaseUrl}nc_updater.exe', 'nc_updater.exe', '');
  DownloadPage.Add('{#BaseUrl}nc_updater.json', 'nc_updater.json', '');
  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
      Result := True;
    except
      if DownloadPage.AbortedByUser then
        Log('Download aborted by user.')
      else
        SuppressibleMsgBox('The download failed:' + #13#10#13#10 +
          GetExceptionMessage + #13#10#13#10 +
          'Nothing has been installed. Please check your internet connection and try again.',
          mbCriticalError, MB_OK, IDOK);
    end;
  finally
    DownloadPage.Hide;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpReady) and WizardIsTaskSelected('install_nc') then
    Result := DownloadFiles;
end;

// Adds both folders to Defender's exclusion list via one elevated PowerShell call.
// Runs before files are copied so the exclusions are in place when they land.
procedure AddDefenderExclusions;
var
  Paths, Params: String;
  ResultCode: Integer;
begin
  Paths := '''' + ExpandConstant('{app}\bin') + ''',''' + ExpandConstant('{app}\native_host') + '''';
  Params := '-NoProfile -Command "$ErrorActionPreference = ''Stop''; Add-MpPreference -ExclusionPath ' + Paths + '"';

  ExclusionsAdded := ShellExec('runas', 'powershell.exe', Params, '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);

  if not ExclusionsAdded then
    SuppressibleMsgBox('The Windows Defender exclusions could not be added (the administrator ' +
      'prompt may have been declined, or another antivirus manages Defender).' + #13#10#13#10 +
      'The installation will continue. You can add the exclusions manually in ' +
      'Windows Security > Virus & threat protection > Manage settings > Exclusions.',
      mbInformation, MB_OK, IDOK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Msg: String;
begin
  if CurStep = ssInstall then
  begin
    if WizardIsTaskSelected('whitelist_bin') then
      AddDefenderExclusions;
  end;

  if CurStep = ssPostInstall then
  begin
    Msg := 'Installation complete!' + #13#10#13#10 +
           'The Native Client has been installed in:' + #13#10 +
           ExpandConstant('{app}\native_host') + #13#10#13#10 +
           'The addon should now be able to communicate with the Native Client.';
    if ExclusionsAdded then
      Msg := Msg + #13#10#13#10 + 'Windows Defender exclusions were added for the Native Client folders.';
    MsgBox(Msg, mbInformation, MB_OK);
  end;
end;
