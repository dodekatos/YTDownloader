; YTDownloader - A browser addon for downloading videos from websites.
; Copyright (C) 2025 dodekatos
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
; along with this program.  If not, see <http://www.gnu.org/licenses/>.

; YTDownloader Native Host Installer
; Downloads Native Client (+ Updater) for Firefox native messaging
; Has optional dependency downloads, and Windows Defender whitelist

[Setup]
AppName=YTDownloader Native Host
AppVersion=0.3.6
VersionInfoVersion=0.0.3.6
DefaultDirName={commonappdata}\YTDownloader
DisableDirPage=yes
DisableProgramGroupPage=yes
OutputBaseFilename=native-client-setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
SetupIconFile=icon-128.ico

[Dirs]
Name: "{commonappdata}\YTDownloader\bin"
Name: "{commonappdata}\YTDownloader\native_host"

[Registry]
; 64-bit Firefox Native Client (modern)
Root: HKCU64; Subkey: "Software\Mozilla\NativeMessagingHosts\ytdlp_host"; \
    ValueType: string; ValueName: ""; ValueData: "{commonappdata}\YTDownloader\native_host\ytdlp_host.json"; Flags: uninsdeletekey
; 32-bit Firefox Native Client (fallback)
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\ytdlp_host"; \
    ValueType: string; ValueName: ""; ValueData: "{commonappdata}\YTDownloader\native_host\ytdlp_host.json"; Flags: uninsdeletekey
; 64-bit Firefox Native Client Updater (modern)
Root: HKCU64; Subkey: "Software\Mozilla\NativeMessagingHosts\nc_updater"; \
    ValueType: string; ValueName: ""; ValueData: "{commonappdata}\YTDownloader\native_host\nc_updater.json"; Flags: uninsdeletekey
; 32-bit Firefox Native Client Updater (fallback)
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\nc_updater"; \
    ValueType: string; ValueName: ""; ValueData: "{commonappdata}\YTDownloader\native_host\nc_updater.json"; Flags: uninsdeletekey

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\YTDownloader\native_host"

[Tasks]
Name: "install_nc"; Description: "Install Native Client"; GroupDescription: "Main components:"
Name: "whitelist_bin"; Description: "Whitelist in Windows Defender"; GroupDescription: "Optional components:"; Flags: unchecked
Name: "install_ffmpeg"; Description: "Install FFmpeg + FFprobe (Takes a while)"; GroupDescription: "Optional components:"; Flags: unchecked
Name: "install_ytdlp"; Description: "Install YT-DLP (Takes a while)"; GroupDescription: "Optional components:"; Flags: unchecked

[Run]
; Download ytdlp_host.exe
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\native_host\ytdlp_host.exe') {{ Remove-Item '{commonappdata}\YTDownloader\native_host\ytdlp_host.exe' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/ytdlp_host.exe' -OutFile '{commonappdata}\YTDownloader\native_host\ytdlp_host.exe'"""; \
  Flags: runhidden; StatusMsg: "Downloading ytdlp_host.exe..."; \
  Tasks: install_nc

; Download ytdlp_host.json
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\native_host\ytdlp_host.json') {{ Remove-Item '{commonappdata}\YTDownloader\native_host\ytdlp_host.json' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/ytdlp_host.json' -OutFile '{commonappdata}\YTDownloader\native_host\ytdlp_host.json'"""; \
  Flags: runhidden; StatusMsg: "Downloading ytdlp_host.json..."; \
  Tasks: install_nc

; Download nc_updater.exe
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\native_host\nc_updater.exe') {{ Remove-Item '{commonappdata}\YTDownloader\native_host\nc_updater.exe' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/nc_updater.exe' -OutFile '{commonappdata}\YTDownloader\native_host\nc_updater.exe'"""; \
  Flags: runhidden; StatusMsg: "Downloading nc_updater.exe..."; \
  Tasks: install_nc

; Download nc_updater.json
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\native_host\nc_updater.json') {{ Remove-Item '{commonappdata}\YTDownloader\native_host\nc_updater.json' -Force }; Invoke-WebRequest 'https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/nc_updater.json' -OutFile '{commonappdata}\YTDownloader\native_host\nc_updater.json'"""; \
  Flags: runhidden; StatusMsg: "Downloading nc_updater.json..."; \
  Tasks: install_nc

; === Install FFmpeg + FFprobe ===
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\bin\ffmpeg') {{ Remove-Item '{commonappdata}\YTDownloader\bin\ffmpeg' -Recurse -Force }; Invoke-WebRequest 'https://github.com/GyanD/codexffmpeg/releases/download/8.0/ffmpeg-8.0-full_build-shared.zip' -OutFile '{commonappdata}\YTDownloader\bin\ffmpeg-temp.zip'; Expand-Archive -Path '{commonappdata}\YTDownloader\bin\ffmpeg-temp.zip' -DestinationPath '{commonappdata}\YTDownloader\bin\ffmpeg'; Remove-Item '{commonappdata}\YTDownloader\bin\ffmpeg-temp.zip' -Force"""; \
  Flags: runhidden; \
  StatusMsg: "Downloading FFmpeg + FFprobe - This may take some time due to Powershell's slow download speed..."; \
  Tasks: install_ffmpeg

; === Install YT-DLP ===
Filename: "powershell.exe"; \
  Parameters: "-ExecutionPolicy Bypass -Command ""if (Test-Path '{commonappdata}\YTDownloader\bin\yt-dlp.exe') {{ Remove-Item '{commonappdata}\YTDownloader\bin\yt-dlp.exe' -Force }; Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '{commonappdata}\YTDownloader\bin\yt-dlp.exe'"""; \
  Flags: runhidden; \
  StatusMsg: "Downloading YT-DLP - This may take some time due to Powershell's slow download speed..."; \
  Tasks: install_ytdlp

; === Add Windows Defender exception ===
Filename: "powershell.exe"; \
  Parameters: "-Command Start-Process PowerShell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -Command Add-MpPreference -ExclusionPath ''C:\ProgramData\YTDownloader\bin''; Read-Host ''Native Client has successfully been whitelisted. Press Enter to continue.''; pause'"""; \
  Flags: nowait; \
  StatusMsg: "Adding antivirus exclusion..."; \
  Tasks: whitelist_bin

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    MsgBox('Installation complete!' + #13#13 +
           'The Native Client has been installed in:' + #13 +
           ExpandConstant('{commonappdata}\YTDownloader\native_host') + #13#13 +
           'The addon should now be able to communicate with the Native Client.' + #13#13,
           mbInformation, MB_OK);
  end;
end;
