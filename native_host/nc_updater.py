# YTDownloader - A browser addon for downloading videos from websites.
# Copyright (C) 2025-2026 dodekatos
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import sys, os, json, shutil, traceback, datetime, struct, requests
# import urllib.request

LOG_PATH = r"C:\ProgramData\YTDownloader\log.txt"

# This is used to log info, errors, etc.
def log(msg):
    now = datetime.datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(f"{now} {msg}\n")

# This is used to send a response to whatever is communicating with us
def send_response(message):
    response = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("I", len(response)))
    sys.stdout.buffer.write(response)
    sys.stdout.flush()

# This is used to read the message sent by whatever is communicating with us
def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    message_length = struct.unpack("I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)

# Handles updating the main native client, ytdlp_host.exe, from the latest version in github.
# The logic for determining if it's worthy of being updated has already been handled - not our job.
def update_native_client():
    native_host_path = r"C:\ProgramData\YTDownloader\native_host"
    download_url = "https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/ytdlp_host.exe"
    target_path = r"C:\ProgramData\YTDownloader\native_host\ytdlp_host.exe"
    temp_path = target_path + ".part"
    try:
        # temp_path = target_path + ".new"
        # log(f"[NCU-Info] Downloading update from {download_url} -> {temp_path}")
        # urllib.request.urlretrieve(download_url, temp_path)
        # log("[NCU-Info] Download complete, replacing old executable")
        
        os.makedirs(native_host_path, exist_ok=True)
        log("[NCU-Info] Starting Native Client update...")
        
        with requests.get(download_url, stream=True, timeout=15) as r:
            r.raise_for_status()
            with open(temp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        
        os.replace(temp_path, target_path)
        log("[NCU-Info] Native Client updated successfully.")
        send_response({"success": True, "message": "Native Client updated successfully"})
    except Exception as e:
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        err = traceback.format_exc()
        log(f"[NCU-Error] Native Client update failed: {err}")
        send_response({"success": False, "message": str(e)})

def main():
    try:
        msg = read_message()
        log(f"[NCU-Info] Message received: {msg}")
        if not msg:
            log(f"[NCU-Error] No message received.")
            send_response({"status": "error", "message": "No message received."})
            return
        action = msg.get("action")
        
        if action == "update_native_client":
            update_native_client()
        
        elif action == "ping":
            log("[NCU-Info] pong!")
            send_response({
                "status": "success",
                "success": True,
                "message": "pong"
            })
        
        else:
            log(f"[NCU-Error] Unknown action message type: {action}")
            send_message({"success": False, "message": "Unknown action"})
    except Exception as e:
        log(f"[NCU-Error] Native Client Updater crashed: {str(e)}")
        send_response({"success": False, "message": "NCU crashed. See log."})

if __name__ == "__main__":
    log("--- Native Client Updater started ---")
    main()