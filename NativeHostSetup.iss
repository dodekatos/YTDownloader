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
; Downloads Native Client (+ Updater) for Firefox native messaging
; Has optional Windows Defender whitelist

[Setup]
AppName=YTDownloader Native Host
AppVersion=0.6.0
VersionInfoVersion=0.0.6.0
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
Name: "whitelist_bin"; Description: "Whitelist in Windows Defender"; GroupDescription: "Optional components:"; Flags: unchecked

[Run]
; Download ytdlp_host.exe
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""$ProgressPreference = 'SilentlyContinue'; if (Test-Path '{app}\native_host\ytdlp_host.exe') {{ Remove-Item '{app}\native_host\ytdlp_host.exe' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/ytdlp_host.exe' -OutFile '{app}\native_host\ytdlp_host.exe' -UseBasicParsing"""; \
  Flags: runhidden; StatusMsg: "Downloading ytdlp_host.exe..."; \
  Tasks: install_nc

; Download ytdlp_host.json
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""$ProgressPreference = 'SilentlyContinue'; if (Test-Path '{app}\native_host\ytdlp_host.json') {{ Remove-Item '{app}\native_host\ytdlp_host.json' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/ytdlp_host.json' -OutFile '{app}\native_host\ytdlp_host.json' -UseBasicParsing"""; \
  Flags: runhidden; StatusMsg: "Downloading ytdlp_host.json..."; \
  Tasks: install_nc

; Download nc_updater.exe
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""$ProgressPreference = 'SilentlyContinue'; if (Test-Path '{app}\native_host\nc_updater.exe') {{ Remove-Item '{app}\native_host\nc_updater.exe' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/nc_updater.exe' -OutFile '{app}\native_host\nc_updater.exe' -UseBasicParsing"""; \
  Flags: runhidden; StatusMsg: "Downloading nc_updater.exe..."; \
  Tasks: install_nc

; Download nc_updater.json
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""$ProgressPreference = 'SilentlyContinue'; if (Test-Path '{app}\native_host\nc_updater.json') {{ Remove-Item '{app}\native_host\nc_updater.json' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/nc_updater.json' -OutFile '{app}\native_host\nc_updater.json' -UseBasicParsing"""; \
  Flags: runhidden; StatusMsg: "Downloading nc_updater.json..."; \
  Tasks: install_nc


; === Add Windows Defender exception ===
Filename: "powershell.exe"; \
  Parameters: "-Command Start-Process PowerShell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -Command Add-MpPreference -ExclusionPath ''{app}\bin''; Read-Host ''Native Client has successfully been whitelisted. Press Enter to continue.''; pause'"""; \
  Flags: nowait; \
  StatusMsg: "Adding antivirus exclusion..."; \
  Tasks: whitelist_bin

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    MsgBox('Installation complete!' + #13#13 +
           'The Native Client has been installed in:' + #13 +
           ExpandConstant('{app}\native_host') + #13#13 +
           'The addon should now be able to communicate with the Native Client.' + #13#13,
           mbInformation, MB_OK);
  end;
end;
