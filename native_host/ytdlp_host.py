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

import sys
import json
import struct
import subprocess
import os
import datetime
import shutil
import requests
import re
import multiprocessing
import urllib.request
from urllib.error import HTTPError, URLError
import zipfile
import io
import threading
import time
import tkinter as tk
from tkinter import filedialog
from email.utils import parsedate_to_datetime
import hashlib
import tempfile
from pathlib import Path
import textwrap
from ffmpeg_progress_yield import FfmpegProgress
import logging
from logging import FileHandler, getLogger, StreamHandler
from logging.handlers import TimedRotatingFileHandler
import traceback

# Constant file locations
PROGRAM_DATA = r"C:\ProgramData\YTDownloader"
BIN_PATH = r"C:\ProgramData\YTDownloader\bin"

DENO_PATH = r"C:\ProgramData\YTDownloader\bin\deno.exe"
DENO_UPDATING_DIR = r"C:\ProgramData\YTDownloader\bin\deno-updating"
YTDLP_PATH = r"C:\ProgramData\YTDownloader\bin\yt-dlp.exe"
FFMPEG_DIR = r"C:\ProgramData\YTDownloader\bin\ffmpeg"
FFMPEG_UPDATING_DIR = r"C:\ProgramData\YTDownloader\bin\ffmpeg-updating"
FFMPEG_PATH = r"C:\ProgramData\YTDownloader\bin\ffmpeg\bin\ffmpeg.exe"
FFPROBE_PATH = r"C:\ProgramData\YTDownloader\bin\ffmpeg\bin\ffprobe.exe"
LOG_PATH = r"C:\ProgramData\YTDownloader\log.txt"
CONFIG_PATH = os.path.join(os.environ["PROGRAMDATA"], "YTDownloader", "native_host", "config.json")
# idk why i did config_path different, but it is what it is
# global current_encoder
# current_encoder = None

def custom_namer(name):
    return name.replace(".txt", "") + ".txt"

# Set up logger with custom levels and formatting
logging._levelToName[logging.DEBUG] = 'Debug'
logging._levelToName[logging.INFO] = 'Info'
logging._levelToName[logging.WARNING] = 'Warning'
logging._levelToName[logging.ERROR] = 'Error'
logging._levelToName[logging.CRITICAL] = 'Critical'

log2 = logging.getLogger("nc_logger")
log2.setLevel(logging.DEBUG)

# Use TimedRotatingFileHandler
handler = TimedRotatingFileHandler(
    filename=LOG_PATH,
    when="midnight",
    interval = 1,
    backupCount=2,
    encoding="utf-8"
)

handler.namer = custom_namer
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt='%Y-%m-%d %H:%M:%S')
handler.setFormatter(formatter)
log2.addHandler(handler)

# This is used to log info, errors, etc.
# def log_old_original(msg):
    # now = datetime.datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    # with open(LOG_PATH, "a", encoding="utf-8") as f:
        # f.write(f"{now} {msg}\n")

    # # Truncate log if >1MB
    # if os.path.getsize(LOG_PATH) > 1 * 1024 * 1024:
        # with open(LOG_PATH, "r", encoding="utf-8") as f:
            # lines = f.readlines()[-1000:]
        # with open(LOG_PATH, "w", encoding="utf-8") as f:
            # f.writelines(lines)

MAX_LOG_LINES = 1000

def _safe_open(path: Path, mode: str, *, encoding="utf-8", errors=None):
    try:
        return open(path, mode, encoding=encoding, errors=errors)
    except (UnicodeDecodeError, UnicodeEncodeError):
        # Fallback to binary if decoding/encoding fails
        return open(str(path), mode.replace("t", "b"))

# TODO - Make this less dumb
def log(message):
    log2.info(message)

# Deprecated - To be removed once new logging has been working for a while
def log_old(msg: str) -> None:
    # Append a timestamped message to the single log file. When the file grows beyond 1MiB we keep only the last 1000 lines.
    now = datetime.datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    log_entry = f"{now} {msg}\n"
    
    # 1. (Try to) Append the new line (UTF-8 is guaranteed because we encode it here)
    try:
        with _safe_open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except OSError as e:
        # If we cannot write to the file for any reason, give up and log that the issue happened.
        log2.warning(f"Failed to write to log file: {str(e)}")
        return
    
    # 2. Returns if the file size is under 1MB AND if there are under 1000 lines
    try:
        size = Path(LOG_PATH).stat().st_size
    except (OSError, ValueError) as e:
        log2.warning(f"Failed to get log file size: {str(e)}")
        return
    
    if size <= MAX_LOG_SIZE_BYTES and Path(LOG_PATH).read_text(errors="ignore").count("\n") <= MAX_LOG_LINES:
        return
    
    # 3. Read all lines from the file
    try:
        with _safe_open(LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
            lines = list(f)
    except Exception as e:
        log2.warning(f"Failed to read log for truncation: {str(e)}")
        return
    
    # 4. Build a tail of recent lines that fit within limits
    tail = []
    current_size = 0
    
    for line in reversed(lines):
        size_line = len(line.encode("utf-8"))
        if current_size + size_line > MAX_LOG_SIZE_BYTES or len(tail) >= MAX_LOG_LINES:
            break
        tail.append(line)
        current_size += size_line
    
    tail.reverse()
    
    # 5. Write the tail back to the log file
    try:
        with _safe_open(LOG_PATH, "w", encoding="utf-8") as f:
            f.writelines(tail)
    except OSError as e:
        log2.warning(f"Failed to truncate log: {str(e)}")



# vv At some point move this into some piece of code that only gets run when re-encoding is being run.
# vv Currently it runs every time the script is run, which might add a tiny bit of latency to each command.
limited_threads = 5
try:
    cpu_count = multiprocessing.cpu_count()
    limited_threads = max(1, round(int(cpu_count * 0.58))) # Rounds to the nearest integer
except Exception as e:
    log(f"[Error] Failed to fetch how many threads the CPU has: {e}")
    log(f"[Info-Error] Default CPU assumed: 4 core, 8 thread CPU (thus, maximum of 5 threads will be used for re-encoding)")

# This is used to load the config.json file which is located at C:\ProgramData\YTDownloader\native_host\config.json
DEFAULT_DOWNLOAD_DIR = os.path.join(os.environ["USERPROFILE"], "Downloads")

# If you update the config to have more than just download_dir, be sure to add it here too!
def create_default_config():
    return {
        "download_dir": DEFAULT_DOWNLOAD_DIR
    }

# Checks if a path is valid
def is_valid_path(path):
    return os.path.isdir(path)
    
def is_invalid_path(path):
    if os.path.isdir(path):
        return False

# Updates the config with new config
def save_config(config):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        log(f"[Temp info] unfixed config: {config}")
        config['download_dir'] = config['download_dir'].replace('/', '\\')
        log(f"[Temp info] fixed config: {config}")
        json.dump(config, f, indent=2)

# Loads the config's file path, what download_dir's file path is, and a recovery notice if there is one.
def load_config():
    try:
        if not os.path.exists(CONFIG_PATH):
            log("[Error] Config file missing. Creating default config.")
            config = create_default_config()
            config_dir = config["download_dir"]
            save_config(config)
            return config, config_dir, "Config file is missing - new one created with default info."

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        config_dir = config["download_dir"]

        if "download_dir" not in config or is_invalid_path(config["download_dir"]):
        #if "download_dir" not in config:
            log(f"[Error] Temporary log: {config}")
            log("[Error] Invalid or missing 'download_dir'. Reverting to default.")
            config = create_default_config()
            save_config(config)
            return config, config_dir, "Invalid config - it has now been reset to default."

        return config, config_dir, None  # valid config, no warning

    except Exception as e:
        log(f"[Error] Error loading config: {e}. Reverting to default.")
        config = create_default_config()
        save_config(config)
        return config, config_dir, "Corrupted config - it has now been reset to default."

# This is pretty necessary, so it's globally defined, not just in main()
CFG_PATH, DOWNLOAD_DIR, recovery_notice = load_config()

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
    try:
        if message_length > 5_000_000:
            log(f"[Error] Incoming message too large: {message_length} bytes")
            return None
    except Exception:
        log("[Error] Failed to check incoming message size")
        return None
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)

# This is used to check if YT-DLP and FFMPEG exist where they should
def check_dependencies():
    missing = []
    if not os.path.isfile(YTDLP_PATH):
        missing.append("yt-dlp.exe")
    if not os.path.isfile(DENO_PATH):
        missing.append("deno.exe")
    if not os.path.isfile(FFMPEG_PATH):
        missing.append("ffmpeg.exe")
    if not os.path.isfile(FFPROBE_PATH):
        missing.append("ffprobe.exe")
    return missing

# This is where all the download logic and downloading happens.
def run_download(url, format_key, datechecked, pagetype):
    reencode_notice = ""
    missing = check_dependencies()
    if missing:
        log(f"[Error] Missing dependencies: {', '.join(missing)}")
        return {"status": "error", "message": f"Missing: {', '.join(missing)}"}
    
    channelfolder = "%(uploader)s/" if pagetype == "channel" else ""
    playlistfolder = "%(playlist)s/%(playlist_index)s - " if pagetype in ("playlist", "channelplaylists") else ""
    date_format = "[%(upload_date>%Y-%m-%d)s] " if datechecked else ""
    output_location = os.path.join(DOWNLOAD_DIR, f"{channelfolder}{playlistfolder}{date_format}%(title).100B.%(ext)s")
    base_args = [
        YTDLP_PATH,
        url,
        "--no-playlist", "--no-mtime", "--add-metadata", "--force-ipv4",
        "--ffmpeg-location", os.path.dirname(FFMPEG_PATH)
    ]
    
    def bestreplace(format_key):
        char_remove = ['p', 'GENERIC']
        new_format_key = format_key
        for char in char_remove:
            new_format_key = new_format_key.replace(char, '')
        return new_format_key
    
    theargs = {
        "m4a": "bestaudio[ext=m4a][format_id!*=drc]",
        "mp3": "bestaudio[format_id!*=drc]",
        "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a][format_id!*=drc]",
        "otherres": f"bestvideo[ext=mp4][height<={format_key.replace('p','')}]+bestaudio[ext=m4a][format_id!*=drc]",
        "bestGENERIC": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", # Generic bests just remove the removal of VP9 and DRC
        "otherresGENERIC": f"bestvideo[ext=mp4][height<={bestreplace(format_key)}]+bestaudio[ext=m4a]/best[ext=mp4][height<={bestreplace(format_key)}]/best[height<={bestreplace(format_key)}]", # idc if this is jank
        "m4aGENERIC": "bestaudio[ext=m4a]/bestaudio",
        "mp3GENERIC": "bestaudio",
    }

    if format_key == "m4a":
        args = base_args + [
            "-f", theargs['m4a'],
            "-o", output_location
        ]
        log(f"[Info] Format key (m4a): {format_key} applied.")
    elif format_key == "mp3":
        args = base_args + [
            "-f", theargs['mp3'],
            "-o", output_location,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "3"
        ]
        log(f"[Info] Format key (mp3): {format_key} applied.")
    elif format_key == "best":
        args = base_args + [
            "-f", theargs['best'],
            "-o", output_location,
            "--embed-thumbnail"
        ]
        log(f"[Info] Format key (best): {format_key} applied.")
    elif format_key in ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"]:
        args = base_args + [
            "-f", theargs['otherres'],
            "-o", output_location,
            "--embed-thumbnail"
        ]
        log(f"[Info] Format key (otherres): {format_key} applied.")
    elif format_key in ["2160pGENERIC", "1440pGENERIC", "1080pGENERIC", "720pGENERIC", "480pGENERIC"]:
        args = base_args + [
            "-f", theargs['otherresGENERIC'],
            "-o", output_location,
            "--embed-thumbnail"
        ]
        log(f"[Info] Format key (otherresGENERIC): {format_key} applied.")
        log(f"[TempInfo] theargs: {theargs['otherresGENERIC']}")
        log(f"[TempInfo] final args for otherresGENERIC: {args}")
    elif format_key == "bestGENERIC":
        args = base_args + [
            "-f", theargs['bestGENERIC'],
            "-o", output_location,
            "--embed-thumbnail"
        ]
        log(f"[Info] Format key (bestGENERIC): {format_key} applied.")
    elif format_key == "m4aGENERIC":
        args = base_args + [
            "-f", theargs['m4aGENERIC'],
            "-o", output_location
        ]
        log(f"[Info] Format key (m4aGENERIC): {format_key} applied.")
    elif format_key == "mp3GENERIC":
        args = base_args + [
            "-f", theargs['mp3GENERIC'],
            "-o", output_location,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "3"
        ]
        log(f"[Info] Format key (mp3GENERIC): {format_key} applied.")
    
    
    else:
        log(f"[Error] Unsupported format: {format_key}")
        return {"status": "error", "message": f"Unsupported format: {format_key}"}
    
    # This is where it runs the download command!
    log(f"[Info] Running command: {args}")
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=True, timeout=43200)
        if result.returncode != 0:
            log(f"[Massive Error] Error somewhere in the whole run_download def: {result.stderr}")
            return {"status": "error", "message": result.stderr}
        log(f"[Success] Download successful!")
        return {"status": "success", "message": "Download complete.", "reencode_notice": reencode_notice}
    except Exception as e:
            log(f"[Massive Error] Exceptional error with the download command: {str(e)}")
            return {"status": "error", "success": False, "message": str(e)}
    except subprocess.TimeoutExpired:
        log(f"[Massive Error] Timeout expired on the download command")
        return {"status": "error", "success": False, "message": "Download command cancelled due to 12 hour timeout"}

    
# Checks what our current YT-DLP version is
def get_local_ytdlp_version():
    try:
        output = subprocess.check_output([YTDLP_PATH, "--version"], text=True).strip()
        #log(f"[Info] YT-DLP version: {output}")
        return output
    except Exception as e:
        log(f"[Error] Unable to find YT-DLP version: {e}")
        return None

# Checks with GitHub what the latest release of YT-DLP is
def get_latest_ytdlp_version():
    try:
        resp = requests.get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest", timeout=5)
        if resp.ok:
            return resp.json()["tag_name"]
    except Exception as e:
        log(f"[Error] Unable to find latest YT-DLP version: {e}")
        return None

# If the user asks, and if a new version of YT-DLP is available, we will update it
def download_latest_ytdlp():
    YT_DLP_URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    temp_path = YTDLP_PATH + ".part"
    
    try:
        os.makedirs(BIN_PATH, exist_ok=True)
        log("[Info] Starting YT-DLP.exe download...")
        
        with requests.get(YT_DLP_URL, stream=True, timeout=15) as r:
            r.raise_for_status()
            with open(temp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        
        os.replace(temp_path, YTDLP_PATH)
        log("[Info] YT-DLP.exe downloaded successfully!")
        return {"success": True}
        
    except Exception as e:
        log(f"[Error] Failed to download YT-DLP.exe: {e}")
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return {"success": False, "message": str(e)}

# Finds the URL's file sizes for each download option, and returns what they are
def get_file_sizes(url):
    log("[TempInfo] Start of get file sizes def")
    
    # For fixing up the file sizes
    def format_bytes(num_bytes):
        if num_bytes is None:
            return None
        if num_bytes < 100 * 1024 * 1024:
            return f"{num_bytes / (1024 * 1024):.1f}MB"
        elif num_bytes < 1024 * 1024 * 1024:
            return f"{num_bytes / (1024 * 1024):.0f}MB"
        else:
            return f"{num_bytes / (1024 * 1024 * 1024):.1f}GB"
    
    try:
        try: 
            result = subprocess.run(
                [YTDLP_PATH, "--dump-json", url, "--force-ipv4"],
                capture_output=True, text=True, check=True, timeout=20
            )
        except Exception as e:
            log(f"[Error] Exceptional error with: {str(e)}")
            result = None
            return {"error": "Failed to fetch info"}
        except subprocess.TimeoutExpired:
            log(f"[Error] Timeout expired on dumping the json")
            result = None
            return {"error": "Failed to fetch info"}
        
        info = json.loads(result.stdout)
        #log(f"[TempInfo] file sizes json dump: {info}") # TEMPORARY, REMOVE AFTER TESTING IS DONE <========================================================
        formats = info.get("formats", [])
        format_sizes = {}
        
        # --- Find best M4A audio filesize ---
        audio_streams = [
            f for f in formats
            if f.get("vcodec") == "none" and f.get("acodec") == "mp4a.40.2" and f.get("filesize")
        ]
        best_audio = max(audio_streams, key=lambda f: f.get("abr", 0), default=None)
        audio_size = best_audio.get("filesize") if best_audio else 0
        
        # --- Utility to fetch best matching video filesize ---
        def get_best_video_size(condition_fn):
            video_streams = [
                f for f in formats
                if f.get("acodec") == "none" and f.get("vcodec") != "none" and f.get("filesize") and condition_fn(f)
            ]
            if not video_streams:
                return None
            # Pick highest resolution match
            best = max(video_streams, key=lambda f: f.get("height") or 0)
            return best["filesize"]
        
        # --- Define all the smart formats ---
        smart_formats = {
            "best": lambda f: f.get("ext") == "mp4",
            "2160p": lambda f: f.get("height") == 2160 and f.get("ext") == "mp4",
            "1440p": lambda f: f.get("height") == 1440 and f.get("ext") == "mp4",
            "1080p": lambda f: f.get("height") == 1080 and f.get("ext") == "mp4",
            "720p": lambda f: f.get("height") == 720 and f.get("ext") == "mp4",
            "480p": lambda f: f.get("height") == 480 and f.get("ext") == "mp4",
            "360p": lambda f: f.get("height") == 360 and f.get("ext") == "mp4",
            "240p": lambda f: f.get("height") == 240 and f.get("ext") == "mp4",
            "144p": lambda f: f.get("height") == 144 and f.get("ext") == "mp4",
            #"bestGENERIC": lambda f: True,
            #"1080pGENERIC": lambda f: f.get("height") == 1080,
            #"720pGENERIC": lambda f: f.get("height") == 720,
            #"480pGENERIC": lambda f: f.get("height") == 480,
            "m4a": lambda f: f.get("vcodec") == "none" and f.get("acodec") == "mp4a.40.2",
            #"m4aGENERIC": lambda f: f.get("vcodec") == "none" and f.get("acodec") == "mp4a.40.2",
        }
        
        # --- Estimate sizes for all video+audio formats ---
        for key, condition in smart_formats.items():
            if "m4a" in key:
                # Audio-only size
                target_audio = [
                    f for f in formats if condition(f) and f.get("filesize")
                ]
                if target_audio:
                    size = max(target_audio, key=lambda f: f.get("abr", 0))["filesize"]
                    format_sizes[key] = format_bytes(size)
                continue

            # Video + audio combo
            video_size = get_best_video_size(condition)
            if video_size:
                total = video_size + audio_size
                format_sizes[key] = format_bytes(total)
        
        # --- Add derived MP3 format ---
        # MP3 = 5% more than m4a
        if "m4a" in format_sizes and best_audio and best_audio.get("filesize"):
            format_sizes["mp3"] = format_bytes(int(best_audio["filesize"] * 1.05))
        #if "m4aGENERIC" in format_sizes and best_audio and best_audio.get("filesize"):
            #format_sizes["mp3GENERIC"] = format_bytes(int(best_audio["filesize"] * 1.02))
        
        if "144p" in format_sizes and best_audio and best_audio.get("filesize"):
            amv_1 = format_sizes["144p"]
            if "MB" in amv_1:
                amv_2 = float(amv_1.replace("MB", "").strip())
            elif "GB" in amv_1:
                amv_2 = float(amv_1.replace("GB", "").strip()) * 1000
            amv_3 = int(amv_2) * 1.62 * 1024 * 1024
            format_sizes["amv"] = format_bytes(amv_3)
            
        log(f"[Info] format_sizes: {format_sizes}")
        return format_sizes

    except subprocess.CalledProcessError as e:
        log(f"[Error] Could not get format sizes: {e}")
        return {"error": "Failed to fetch info"}
    except Exception as e:
        log(f"[Error] Even bigger error: {e}")
        return { "error": f"Exception during size check: {str(e)}" }

# Check the local version of ffmpeg
def get_local_ffmpeg_version():
    try:
        try:
            result = subprocess.run(
                [FFMPEG_PATH, "-version"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20
            )
            if result.returncode != 0:
                #raise RuntimeError(result.stderr.strip())
                result = None
                return result
        except Exception as e:
            log(f"[Error] Couldn't find FFMPEG's version. Maybe it doesn't exist (yet): {str(e)}")
            result = None
            return result
        except subprocess.TimeoutExpired:
            log(f"[Error] Timeout expired on finding FFMPEG's version")
            return None
        
        first_line = result.stdout.splitlines()[0]
        parts = first_line.split()
        if len(parts) < 3:
            log(f"[Error] Unexpected FFMPEG -version output")
            raise ValueError("Unexpected FFMPEG -version output")
        
        version = parts[2]
        if "-" in version:
            version = version.split("-", 1)[0]
        
        return version.strip()
        #match = re.search(r"ffmpeg\s+version\s+([^\s]+)", result.stdout)
        #return match.group(1) if match else "Unknown"
    except Exception as e:
        log(f"[Error] Could not find FFMPEG version - according to the regex filter, at least: {e}")
        return None

# Finds the info of the latest FFMPEG (shared full build) version from Gyan's Github
def get_latest_ffmpeg_info():
    api_url = "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest"
    with urllib.request.urlopen(api_url) as resp:
        data = json.load(resp)

    assets = data.get("assets", [])
    build = next((a for a in assets if "full_build-shared" in a["name"] and a["name"].endswith(".zip")), None)
    
    if not build: # TODO: Change this to be in line with how it should actually work jeez
        raise RuntimeError("Could not find FFmpeg shared build asset on GitHub.")

    return {
        "version": data["tag_name"],
        "download_url": build["browser_download_url"],
        "filename": build["name"]
    }

# Finds the SHA256 checksum for the latest FFMPEG (shared full build) version from Gyan's website
def get_sha256_from_gyan():
    api_url = "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest"
    resp = requests.get(api_url, timeout=10)
    resp.raise_for_status()
    release = resp.json()
    
    for asset in release["assets"]:
        if "full_build-shared.zip" in asset["name"]:
            #return {
            #    "name": asset["name"],
            #    "download_url": asset["browser_download_url"],
            #    "sha256": asset.get("sha256", None)  # Some releases have this field now
            #}
            
            #return asset.get("sha256", None)
            return (asset["digest"])[7:]
    
    raise RuntimeError("Could not find ffmpeg-release-full-shared.zip asset")

    # vv old code that would've worked if gyan published the .zip sha256 on their website, and not just for 7z
    # vv or maybe if py7zr supported extracting this type of file
    #with urllib.request.urlopen("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full-shared.7z.sha256") as resp:
        #text = resp.read().decode("utf-8").strip()
        #if not re.fullmatch(r"[0-9a-fA-F]{64}", text):
            #log(f"[Error] Gyan's SHA256 for latest FFMPEG version did not match our regex: {str(text)}")
            #raise ValueError("Unexpected SHA256 format from Gyan's site.")
        #return text

# Calcualtes the SHA256 of a file
def calc_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

# Checks if an FFMPEG update is available, comparing against the current version
def check_ffmpeg_update_available():
    try:
        #log("[Info] Checking for FFmpeg updates.") # unnecessary extra log
        
        local_version = get_local_ffmpeg_version()
        latest = get_latest_ffmpeg_info()
        
        if local_version is None:
            return {
                "status": "success",
                "update_available": True,
                "local": local_version,
                "latest": latest["version"],
                "message": "FFMPEG not installed. Download required."
            }
        
        if local_version == "Unknown":
            return {
                "status": "success",
                "update_available": False,
                "local_version": local_version,
                "latest_version": latest["version"],
                "message": "Unable to determine local FFMPEG version."
            }
        
        update_needed = local_version != latest["version"]
        msg = "FFMPEG update available." if update_needed else "FFMPEG is already up to date."
        
        log(f"[Info] {msg} (Local: {local_version}, Latest: {latest['version']})")
        
        return {
            "status": "success",
            "update_available": update_needed,
            "local": local_version,
            "latest": latest["version"],
            "message": msg
        }
    
    except Exception as e:
        log(f"[Error] FFMPEG update check failed: {e}")
        return {"status": "error", "message": str(e)}

# Code for updating FFMPEG+FFPROBE
def update_ffmpeg():
    try:
        log("[Info] Checking for FFmpeg updates...")
        
        local_version = get_local_ffmpeg_version()
        log(f"[Info] Local FFmpeg version: {local_version}")
        latest = get_latest_ffmpeg_info()
        log(f"[Info] Latest FFmpeg version online: {latest['version']}")
        
        # Compare versions (simple mismatch check)
        if local_version == latest["version"]:
            log("[Info] FFmpeg is already up to date")
            return {"status": "success", "success": True, "message": "FFMPEG is already up to date."}
        
        # Download latest .zip
        os.makedirs(FFMPEG_UPDATING_DIR, exist_ok=True)
        temp_zip_path = os.path.join(FFMPEG_UPDATING_DIR, latest["filename"])
        urllib.request.urlretrieve(latest["download_url"], temp_zip_path)
        log(f"[Info] Downloaded new FFMPEG archive: {latest['filename']}")
        
        # Verify checksum (from Gyan.dev)
        expected_hash = get_sha256_from_gyan()
        actual_hash = calc_sha256(temp_zip_path)
        log(f"[Info] The hash is supposed to be: {expected_hash}")
        log(f"[Info] The calculated hash is....: {actual_hash}")
        if expected_hash.lower() != actual_hash.lower():
            log(f"[Critical Error] FFMPEG's SHA256 checksum does not match what it is supposed to be!!")
            raise ValueError("Checksum mismatch! Download may be corrupted.")
        log("[Info] FFMPEG SHA256 checksum verified successfully.")
        
        # Extract into ffmpeg-updating
        try:
            with zipfile.ZipFile(temp_zip_path, "r") as archive:
                archive.extractall(path=FFMPEG_UPDATING_DIR)
            os.remove(temp_zip_path)
        except Exception as e:
            log(f"[Error] Failed to extract FFMPEG .zip to updating directory: {e}")
            return {"status": "error", "success": False, "message": "Failed to extract FFMPEG .zip to updating directory"}
        log(f"[Info] Successfully extracted FFMPEG .zip to updating directory")
        
        # Find main folder inside extracted archive (usually 'ffmpeg-x.xx-full_build-shared')
        inner_dirs = [d for d in os.listdir(FFMPEG_UPDATING_DIR) if os.path.isdir(os.path.join(FFMPEG_UPDATING_DIR, d))]
        if len(inner_dirs) == 1:
            inner_dir = os.path.join(FFMPEG_UPDATING_DIR, inner_dirs[0])
            for item in os.listdir(inner_dir):
                shutil.move(os.path.join(inner_dir, item), FFMPEG_UPDATING_DIR)
            shutil.rmtree(inner_dir)
        
        # Verify binaries exist
        if not os.path.exists(os.path.join(FFMPEG_UPDATING_DIR, "bin", "ffmpeg.exe")):
            log(f"[Error] Couldn't find ffmpeg.exe in the updating directory")
            raise FileNotFoundError("Extracted FFmpeg folder missing ffmpeg.exe")
        
        # Replace old version
        try:
            if os.path.exists(FFMPEG_DIR):
                shutil.rmtree(FFMPEG_DIR)
            os.rename(FFMPEG_UPDATING_DIR, FFMPEG_DIR)
        except Exception as e:
            log(f"[Error] Failed to remove existing FFMPEG directory, and then rename FFMPEG updating directory to replace it: {e}")
            # TODO: for all these exceptions that don't send a response, don't you think it should send a response saying there was an error?
            # Look into it!
            raise FileNotFoundError("Failed to replace old FFMPEG with new FFMPEG")
        
        log("[Info] FFMPEG has successfully been updated.")
        return {"status": "success", "success": True,"local": get_local_ffmpeg_version(), "latest": latest["version"]}
    
    except Exception as e:
        log(f"[Bigger Error] FFMPEG update failed: {e}")
        try:
            if os.path.exists(FFMPEG_UPDATING_DIR):
                shutil.rmtree(FFMPEG_UPDATING_DIR, ignore_errors=True)
        except Exception as e2:
            log(f"[Error inside an error] Failed to remove the temporary FFMPEG updating directory: {e2}")
        return {"status": "error", "success": False, "error": str(e)}

# ------ New whole Re-encode Tool bit ------
SUPPORTED_INPUT_EXTS = {
    ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv", ".ts", ".m4a",
    ".mp3", ".wav", ".flac", ".ogg", ".opus", ".aac", ".wma"
}

# Opens a File Explorer window for the user to choose a file to re-encode
def pick_file_dialog():
    try:
        root = tk.Tk()
        root.withdraw()
        # Build filter string like: "Supported files (*.mp4;*.mkv;... )|*.mp4;*.mkv;..."
        patterns = ";" .join(f"*{ext}" for ext in sorted(SUPPORTED_INPUT_EXTS))
        filetypes = [("Supported media", patterns), ("All files", "*.*")]
        path = filedialog.askopenfilename(title="Choose a media file", filetypes=filetypes)
        log(f"[Info] File chosen to convert: {path}")
        root.update_idletasks()
        root.destroy()
        return path or None
    except Exception as e:
        log(f"[Error] Failed to pick file dialog: {e}")
        return None

# Checks the user submitted file against criteria, and for its codecs and such
def probe_file(path):
    try:
        if not os.path.isfile(path):
            return {"success": False, "error": "File not found."}
        cmd = [
            FFPROBE_PATH, "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            path
        ]
        log(f"[Info] Re-encode command to run: {cmd}")
        proc = subprocess.run(cmd, capture_output=True)
        proc_utf8 = proc.stdout.decode("utf-8", errors="replace")
        
        if proc.returncode != 0:
            return {"success": False, "error": proc.stderr.strip() or "ffprobe error"}
        
        if proc_utf8.strip():
            info = json.loads(proc_utf8)
        else:
            log("[Error] ffprobe output bad i guess?")
        # Summarize
        has_video = any(s.get("codec_type") == "video" for s in info.get("streams", []))
        has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
        vcodec = next((s.get("codec_name") for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
        acodec = next((s.get("codec_name") for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
        container = (info.get("format", {}) or {}).get("format_name")
        duration = (info.get("format", {}) or {}).get("duration")
        streams = info.get("streams") or {}
        video_height = next((s.get("height") for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
        video_width = next((s.get("width") for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
        video_fps = next((s.get("avg_frame_rate") for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
        vbitrate = (info.get("format", {}) or {}).get("bit_rate")
        file_size = (info.get("format", {}) or {}).get("size")
        
        # Get the input audio's bitrate and apply sanity bounds if needed
        audio_stream = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
        if audio_stream and "bit_rate" in audio_stream:
            try:
                input_bitrate_kbps = int(audio_stream["bit_rate"]) // 1000
                log(f"[TempInfo] Reencode input audio bitrate is: {input_bitrate_kbps}")
            except ValueError:
                log("[Error] Reencode input audio bitrate could not be found")
                input_bitrate_kbps = None
        else:
            log("[Error] Reencode input audio bitrate could not be found")
            input_bitrate_kbps = None
        
        if not input_bitrate_kbps or input_bitrate_kbps <= 0:
            final_bitrate_kbps = 192
        else:
            final_bitrate_kbps = max(128, min(input_bitrate_kbps, 320))
        log(f"[TempInfo] Thus the final re-encode audio bitrate is: {final_bitrate_kbps}")
        
        # Yup that's all done, return the values
        log(f"[Info] Successfully probed file")
        return {
            "success": True,
            "path": path,
            "container": container,
            "video_height": video_height,
            "video_width": video_width,
            "video_fps": video_fps,
            "has_video": has_video,
            "has_audio": has_audio,
            "video_codec": vcodec,
            "audio_codec": acodec,
            "duration": duration,
            "final_bitrate_kbps": final_bitrate_kbps,
            "streams": streams,
            "cpu_threads": limited_threads,
            "vbitrate_kbps": vbitrate,
            "file_size": file_size,
            "output_location": DOWNLOAD_DIR
        }
    except Exception as e:
        log(f"[Error] Failed to probe file: {e}")
        return {"success": False, "error": str(e)}

# The command used to re-encode the user's chosen file
def build_ffmpeg_cmd(input_path, out_path, v_choice, a_choice, final_bitrate_kbps, attach_metadata, attach_chapters, fps,
        use_gpu, gpu_type, crf_word, v_width, v_height, v_fps):
    """
    v_choice: one of ["copy","libx265","libx264","libsvtav1","none","amv_v"]
    a_choice: one of ["copy","aac","libmp3lame","none","amv_a"]
    """
    # Determine output container
    is_mkv = out_path.lower().endswith(".mkv")
    is_mp4 = out_path.lower().endswith(".mp4")
    is_amv = out_path.lower().endswith(".amv")
    
    attached_idx = None
    attached_codec = None
    disp = None
    
    if not is_amv:
        info = probe_file(input_path)
        streams = info.get("streams", [])
        log(f"[TempInfo] streams is {streams}")
        
        # Find video streams and the attached_pic (if present)
        try:
            video_indices = [i for i,s in enumerate(streams) if s.get("codec_type") == "video"]
        except Exception as e:
            log(f"[Error] video_indices failed: {e}")
        
        log(f"[TempInfo] The streams with video in them (video_indices) are: {video_indices}")
        
        for i in video_indices:
            disp = (streams[i].get("disposition") or {})
            if disp.get("attached_pic") == 1:
                attached_idx = i
                attached_codec = streams[i].get("codec_name")
                break
            else:
                log("[ErrorInfo] There was no attached_pic, so the input file probably didn't have a thumbnail, and it was just generated by the OS.")
                #break
        
        log(f"[TempInfo] attached_idx is: {attached_idx}")
        log(f"[TempInfo] attached_codec is: {attached_codec}")
        log(f"[TempInfo] disp is: {disp}")
    
    cmd = [FFMPEG_PATH, "-hide_banner", "-y", "-i", f"{input_path}"]
    
        # --- GPU quality table ---
    nvidia_h265 = {"low": 36, "default": 30, "high": 24}
    nvidia_h264 = {"low": 34, "default": 28, "high": 22}
    nvidia_av1 = {"low": 44, "default": 36, "high": 30}
    
    intel_h265 = {"low": 32, "default": 26, "high": 20}
    intel_h264 = {"low": 28, "default": 23, "high": 18}
    intel_av1 = {"low": 34, "default": 28, "high": 22}
    
    cpu_h265 = {"low": 26, "default": 22, "high": 18} # Used to be 28 / 24 / 20
    cpu_h264 = {"low": 28, "default": 24, "high": 20}
    cpu_av1 = {"low": 36, "default": 32, "high": 28} # Used to be 38 / 34 / 30
    
    # --- Video handling ---
    if v_choice == "none":
        cmd += ["-vn"]
    
    else:
        # All outputs include video unless "none"
        if v_choice != "amv_v":
            cmd += ["-map", "0"]
        
        # ---------------------------------------------------------------
        # GPU ENCODING PATH
        # ---------------------------------------------------------------
        if use_gpu == "True" and v_choice in ("libx265", "libx264", "libsvtav1"):
            # ------------------ NVIDIA ------------------
            if gpu_type == "nvidia":
                if v_choice == "libx265":
                    cmd += ["-c:v", "hevc_nvenc", "-preset", "p4", "-tune", "hq", "-cq", str(nvidia_h265[crf_word])]
                elif v_choice == "libx264":
                    cmd += ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", str(nvidia_h264[crf_word])]
                elif v_choice == "libsvtav1":
                    cmd += ["-c:v", "av1_nvenc", "-preset", "p4", "-cq", str(nvidia_av1[crf_word])]
            
            # ------------------ INTEL ------------------
            elif gpu_type == "intel":
                if v_choice == "libx265":
                    cmd += ["-c:v", "hevc_qsv", "-global_quality", str(intel_h265[crf_word])]
                elif v_choice == "libx264":
                    cmd += ["-c:v", "h264_qsv", "-look_ahead", "1", "-global_quality", str(nvidia_h264[crf_word])]
                elif v_choice == "libsvtav1":
                    cmd += ["-c:v", "av1_qsv", "-global_quality", str(intel_av1[crf_word])]
            
            # ------------------ AMD ------------------
            elif gpu_type == "amd":
                if v_choice == "libx265":
                    cmd += ["-c:v", "hevc_amf"]
                elif v_choice == "libx264":
                    cmd += ["-c:v", "h264_amf"]
                elif v_choice == "libsvtav1":
                    cmd += ["-c:v", "av1_amf"]
            
            else:
                log("[Weird Error] Somehow use_gpu was True, the video codec was h265/av1, yet gpu_type was not a valid GPU type.")
                
        # ------------------ CPU ------------------
        else:
            if v_choice == "copy":
                cmd += ["-c:v", "copy"]
            elif v_choice == "libx265":
                cmd += ["-c:v", "libx265", "-preset", "medium", "-crf", str(cpu_h265[crf_word])]
            elif v_choice == "libx264":
                cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(cpu_h264[crf_word])]
            elif v_choice == "libsvtav1":
                cmd += ["-c:v", "libsvtav1", "-preset", "6", "-crf", str(cpu_av1[crf_word])]
            elif v_choice == "amv_v":
                cmd += ["-c:v", "amv", "-s", "128x128", "-ac", "1", "-vstrict", "-1", "-r", "15", "-map", "0:v:0", "-block_size", "1470", "-pix_fmt", "yuvj420p"]
            else:
                # fallback copy
                cmd += ["-c:v", "copy"]
    
    # # Applies CRF and FPS if the user requested of it
    # if crf:
        # cmd += ["-crf", str(crf)]
    # elif not crf:
        # # Fallback to default values
        # if v_choice == "libx265":
            # cmd += ["-crf", "24"]
        # if v_choice == "libsvtav1":
            # cmd += ["-crf", "34"]
    
    if fps:
        cmd += ["-r", str(fps)]
    
    # I have no idea what this part means nor does
    # If the input file has a cover/thumbnail:
    if attached_idx is not None:
        if is_mkv:
            log("[TempInfo] It's an MKV")
            # Remove the cover/thumbnail from output and re-attach as MKV attachment
            cmd += ["-map", f"-0:{attached_idx}"]
        else:
            log("[TempInfo] It's an MP4 (or other)")
            # MP4/MOV/… path: keep it as an attached_pic video stream
            # We’ll set per-stream codecs for video:
            # v:0 -> main video encode, v:attached -> copy
            # We don’t know “v:N” for attached; compute N relative among video streams:
            # Build a mapping video_index -> within-video ordinal
            vid_ord = []
            for i in video_indices:
                vid_ord.append(i)
            log(f"[TempInfo] vid_ord is {vid_ord}")
            attached_ord = vid_ord.index(attached_idx)  # 0-based among video streams
            log(f"[TempInfo] attached_ord is {attached_ord}")
            
            # Video codec for the main video (assume main is the first video that isn't attached)
            # Find main video ordinal:
            
            ''' MAIN ORD SUCKS
            main_ord = None
            for j, i in enumerate(video_indices):
                disp = (streams[i].get("disposition") or {})
                log(f"[TempInfo] disp2 is: {disp}")
                if disp.get("attached_pic") != 1:
                    main_ord = j
                    break
            if main_ord is None:
                main_ord = 0  # fallback
            log(f"[TempInfo] main_ord is: {main_ord}")
            '''
            
            # oh right because the video codecs have gotta be ordered when i'm doing this bit in particular. 'attached_idx' is still cool tho
            # WHY NOT JUST USE 'attached_idx' FOR THIS??? WHY DID IT MAKE ALL THIS EXCESSIVE CODE JUST TO REDO WHAT IT'S ALREADY DONE
            # vvv i replaced attached_ord with main_ord idk why it did attached_ord bruh
            # Override explicitly:
            cmd += ["-c:v:{}".format(attached_ord), "copy",
                    "-disposition:v:{}".format(attached_ord), "attached_pic"]
            # Re-apply main video encoder explicitly (in case the global -c:v was overridden by copy above)
            # (This is defensive; often the global -c:v applies already.)
            # Example: ["-c:v:0","libsvtav1","-crf","32","-preset","6"]
            # Only if we know main_ord:
            # (You may skip this if your vcodec_args are global and apply to all v except the explicit copy.)
            # cmd += ["-c:v:{}".format(main_ord)] + vcodec_args[1:]
    
    # MP4-friendly flags
    #if is_mp4:
    #    cmd += ["-movflags", "use_metadata_tags+faststart"]
    
    # Map audio stream depending on user choice
    if a_choice == "none":
        cmd += ["-an"]
    else:
        if a_choice == "copy":
            cmd += ["-c:a", "copy"]
        elif a_choice == "aac":
            cmd += ["-c:a", "aac", "-b:a", f"{final_bitrate_kbps}k"]
        elif a_choice == "libmp3lame":
            cmd += ["-c:a", "libmp3lame", "-b:a", f"{final_bitrate_kbps}k"]
        elif a_choice == "amv_a":
            cmd += ["-c:a", "adpcm_ima_amv", "-map", "0:a:0", "-ar", "22050"]
        else:
            cmd += ["-c:a", "copy"]

    # Preserve metadata/chapters if the user requests it
    if attach_metadata:
        cmd += ["-map_metadata", "0"]
    if attach_chapters:
        cmd += ["-map_chapters", "0"]
    cmd += ["-threads", f"{limited_threads}", out_path]
    #log(f"[Info] FFMPEG conversion CMD to be run is: {cmd}")
    return cmd

def _parse_iso8601_z(dt_str):
    # GitHub commit dates are like "2025-10-05T19:43:22Z"
    # Parse and return timezone-aware UTC datetime
    return datetime.datetime.strptime(dt_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)

# Fetches the 'Last-Modified' date from a Github raw file
def get_github_last_modified(url: str):
    req = urllib.request.Request(url, headers={
        "User-Agent": "YTDownloaderUpdater/1.0",
        "Accept": "application/vnd.github.v3+json"
    })
    # log(f"[Tempinfo] url: {url}")
    # log(f"[Tempinfo] req: {req}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
            if not data:
                return None, None
            commit_obj = data[0]
            # Prefer committer.date; fall back to author.date
            date_str = (commit_obj.get("commit", {})
                                    .get("committer", {})
                                    .get("date"))
            if not date_str:
                date_str = (commit_obj.get("commit", {})
                                        .get("author", {})
                                        .get("date"))
            sha = commit_obj.get("sha")
            # VVV testing static latest version for, well, testing
            # date_str = "2026-10-13T12:24:59Z"
            
            if date_str:
                dt = _parse_iso8601_z(date_str)
                log(f"[TempInfo] dt: {dt} --- sha: {sha}")
                return dt, sha
    except HTTPError as e:
        # e.code may be 403 for rate limit, 404 for not found, etc.
        log(f"[Error] Failed to fetch Github file header (HTTPError): {e}")
        return None, None
    except URLError as e:
        # network issue
        log(f"[Error] Failed to fetch Github file header (URLError): {e}")
        return None, None
    except Exception as e:
        log(f"[Error] Failed to fetch Github file header (Exception): {e}")
        return None, None
    return None, None

# Fallback for grabbing Github last modified time
def get_remote_head_info_raw(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "YTDownloaderUpdater/1.0"})
    try:
        with urlopen(req, timeout=8) as resp:
            headers = resp.headers
            last_mod = headers.get("Last-Modified")
            etag = headers.get("ETag")
            dt = None
            if last_mod:
                # Parse RFC 2822 style header
                from email.utils import parsedate_to_datetime
                try:
                    dt = parsedate_to_datetime(last_mod)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    else:
                        dt = dt.astimezone(timezone.utc)
                except Exception:
                    dt = None
            return dt, etag
    except Exception:
        return None, None

# Gets the local file's last modified datetime (UTC)
def get_local_native_version():
    path = os.path.join(os.environ["PROGRAMDATA"], "YTDownloader", "native_host", "ytdlp_host.exe")
    if not os.path.exists(path):
        return None
    ts = os.path.getmtime(path)
    oorah = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return oorah.replace(microsecond=0)

def get_local_nc_updater_version():
    path = os.path.join(os.environ["PROGRAMDATA"], "YTDownloader", "native_host", "nc_updater.exe")
    if not os.path.exists(path):
        return None
    ts = os.path.getmtime(path)
    oorah = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return oorah.replace(microsecond=0)

# Compares the local vs Github last modified datetime
def compare_local_vs_github(dep):
    # dep can be 'ytdlp_host' or 'nc_updater'
    if dep == "ytdlp_host":
        clean_name = "Native Client"
        local_dt = get_local_native_version()
    elif dep == "nc_updater":
        clean_name = "Native Client Updater"
        local_dt = get_local_nc_updater_version()
    
    github_dt, github_sha = get_github_last_modified(f"https://api.github.com/repos/dodekatos/YTDownloader/commits?path=native_host/{dep}.exe&sha=main&per_page=1")
    
    log(f"[Info] Local {clean_name} last modified time: {local_dt}")
    log(f"[Info] Github {clean_name} last modified time: {github_dt}")
    
    if github_dt is None:
        # Fallback to HEAD on raw URL
        raw_url = f"https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/{dep}.exe"
        remote_dt_head, etag = get_remote_head_info_raw(raw_url)
        remote_dt = remote_dt_head
        remote_sha = None # since you can't get the SHA from this fallback method
    
    if local_dt is None:
        log(f"[Error] Unable to determine {clean_name} local file's last modified datetime")
        send_response({
            "status": "error",
            "success": False,
            "local": "error",
            "message": f"Failed to find {clean_name} version.",
            "update_available": True
        })
    if github_dt is None:
        log(f"[Error] Unable to determine {clean_name} github file's last modified datetime")
        send_response({
            "status": "error",
            "success": False,
            "latest": "error",
            "message": f"Failed to find latest {clean_name} version.",
            "update_available": False
        })
    
    try:
        if github_dt > local_dt:
            log(f"[Info] Update for {clean_name} is available!")
            send_response({
                "status": "success",
                "success": True,
                "local": str(local_dt),
                "latest": str(github_dt),
                "update_available": True
            })
        elif github_dt < local_dt:
            log(f"[Info] Local version for {clean_name} is more recent than Github version. This is normal, and means the user is likely on the latest version.")
            send_response({
                "status": "error",
                "success": True,
                "message": "Local version is newer than Github version.",
                "local": str(local_dt),
                "latest": str(github_dt),
                "update_available": False,
            })
        else:
            log(f"[Info] {clean_name} is already up to date")
            send_response({
                "status": "success",
                "success": True,
                "message": f"{clean_name} is already up to date.",
                "local": str(local_dt),
                "latest": str(github_dt),
                "update_available": False
            })
    except Exception as e:
        log(f"[Error] Unable to compare local vs Github {clean_name} versions. It's likely that one failed to grab. Error: {e}")
        send_response({"status": "error", "message": f"Failed to compare {clean_name} versions."})

def update_nc_updater():
    native_host_path = r"C:\ProgramData\YTDownloader\native_host"
    download_url = "https://raw.githubusercontent.com/dodekatos/YTDownloader/main/native_host/nc_updater.exe"
    target_path = r"C:\ProgramData\YTDownloader\native_host\nc_updater.exe"
    temp_path = target_path + ".part"
    try:
        os.makedirs(native_host_path, exist_ok=True)
        log("[Info] Starting Native Client Updater update...")
        
        with requests.get(download_url, stream=True, timeout=15) as r:
            r.raise_for_status()
            with open(temp_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        
        os.replace(temp_path, target_path)
        log("[Info] Native Client Updater updated successfully.")
        send_response({"success": True, "message": "Native Client Updater updated successfully"})
    except Exception as e:
        # Clean up temp file if it exists
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        err = traceback.format_exc()
        log(f"[Error] Native Client Updater update failed: {err}")
        send_response({"success": False, "message": str(e)})


def get_local_deno_version():
    try:
        output = subprocess.check_output([DENO_PATH, "--version"], text=True).strip()
        match = re.search(r"^deno\s+([\d.]+)", output)
        if match:
            version = match.group(1)
            #log(f"[Info] Local Deno version: {version}")
            return version
        else:
            log(f"[Error] Could not parse Deno version output: {output}")
            return None
    except FileNotFoundError:
        log("[Error] Deno not found on system.")
        return None
    except Exception as e:
        log(f"[Error] Unable to find Deno version: {e}")
        return None

def get_latest_deno_version():
    try:
        resp = requests.get("https://api.github.com/repos/denoland/deno/releases/latest", timeout=5)
        if resp.ok:
            data = resp.json()
            tag = data.get("tag_name", "")
            if tag:
                version = tag.lstrip("vV")  # Remove v or V prefix
                if re.match(r"^\d+(\.\d+)*$", version):
                    #log(f"[Info] Latest Deno version: {version}") # moved logging of this higher up in the chain
                    return version
                else:
                    log(f"[Error] Unexpected Deno version format: {tag}")
            else:
                log("[Error] No 'tag_name' in Deno's GitHub response.")
        else:
            log(f"[Error] Deno GitHub API returned {resp.status_code}")
    except Exception as e:
        log(f"[Error] Unable to find latest Deno version: {e}")
        return None

def check_deno_update_available():
    local = get_local_deno_version()
    latest = get_latest_deno_version()
    
    if local != latest:
        log(f"[Info] An update for Deno is available. (Local: {local}, Latest: {latest})")
        return {
            "status": "success",
            "local": local,
            "latest": latest,
            "update_available": True,
            "message": "An update for Deno is available."
        }
    else:
        log(f"[Info] Deno is already up to date. (Local: {local}, Latest: {latest})")
        return {
            "status": "success",
            "local": local,
            "latest": latest,
            "update_available": False,
            "message": "Deno is up to date."
        }


def get_deno_sha256():
    """Fetch SHA256 checksum for the latest Deno Windows release from GitHub API."""
    DENO_RELEASE_API = "https://api.github.com/repos/denoland/deno/releases/latest"
    try:
        resp = requests.get(DENO_RELEASE_API, timeout=10)
        resp.raise_for_status()
        release = resp.json()

        for asset in release.get("assets", []):
            if asset["name"] == "deno-x86_64-pc-windows-msvc.zip":
                digest = asset.get("digest")
                if digest and digest.startswith("sha256:"):
                    log("[TempInfo] got here")
                    return digest.split("sha256:")[1].strip()
                else:
                    log("[Error] Failed at getting digest")
        log("[Error] Could not find SHA256 digest for Deno release asset.")
    except Exception as e:
        log(f"[Error] Failed to fetch Deno SHA256: {e}")
    log(f"[Error] Just couldn't find Deno SHA256, no error in particular.")
    return None

def verify_sha256(file_path, expected_hash):
    """Verify SHA256 checksum of downloaded file."""
    try:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        calculated_hash = sha256.hexdigest().lower()
        if calculated_hash == expected_hash.lower():
            log("[Info] SHA256 checksum verified successfully.")
            return True
        else:
            log(f"[Error] SHA256 mismatch! Expected: {expected_hash}, Got: {calculated_hash}")
            return False
    except Exception as e:
        log(f"[Error] Failed to verify SHA256: {e}")
        return False

def update_deno():
    """Download and update Deno if a newer version is available."""
    log("[Info] Starting Deno update process...")
    DENO_DOWNLOAD_URL = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
    
    latest_version = get_latest_deno_version()
    local_version = get_local_deno_version()
    
    if not latest_version:
        log("[Error] Could not fetch latest Deno version.")
        return {"success": False, "message": "Could not fetch latest Deno version."}
    if local_version == latest_version:
        log(f"[Info] Deno is already up to date (v{local_version}).")
        return {"success": True, "message": "Deno is already up to date"}
    
    log(f"[Info] Updating Deno from v{local_version or 'N/A'} → v{latest_version}")
    
    # Step 1: Get expected SHA256 hash
    expected_sha = get_deno_sha256()
    if not expected_sha:
        log("[Error] Could not retrieve expected SHA256 checksum for Deno from GitHub.")
        return {"success": False, "message": "Could not retrieve SHA256 checksum"}
    
    # Step 2: Create temp dir for download + extraction
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, "deno.zip")
        
        # Step 3: Download zip
        try:
            log(f"[Info] Downloading Deno from {DENO_DOWNLOAD_URL}")
            with requests.get(DENO_DOWNLOAD_URL, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(zip_path, "wb") as f:
                    shutil.copyfileobj(r.raw, f)
            log("[Info] Deno download complete.")
        except Exception as e:
            log(f"[Error] Failed to download Deno: {e}")
            return {"success": False, "message": "Failed to download Deno. Try again I guess?"}
        
        # Step 4: Verify SHA256
        if not verify_sha256(zip_path, expected_sha):
            log("[Error] Deno SHA256 verification failed. Aborting update.")
            return {"success": False, "message": "Deno SHA256 verification failed. Try again I guess?"}
        
        # Step 5: Extract deno.exe
        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                files = zip_ref.namelist()
                if "deno.exe" not in files:
                    log(f"[Error] Unexpected contents in Deno ZIP: {files}")
                    return {"success": False, "message": "Unexpected contents in Deno zip file. Please contact the dev to look into this."}
                log("[Info] Extracting deno.exe...")
                extracted_path = os.path.join(tmpdir, "deno.exe")
                zip_ref.extract("deno.exe", tmpdir)
        except Exception as e:
            log(f"[Error] Failed to extract Deno ZIP: {e}")
            return {"success": False, "message": "Failed to extract Deno zip. Try again I guess?"}
        
        # Step 6: Replace old deno.exe
        try:
            if os.path.exists(DENO_PATH):
                os.remove(DENO_PATH)
            shutil.move(extracted_path, DENO_PATH)
            log(f"[Info] Deno successfully updated to v{latest_version}")
            return  {"success": True, "message": "Deno successfully updated."}
        except PermissionError:
            log("[Error] Permission denied while updating Deno — try running as Administrator.")
            return {"success": False, "message": "Failed to update Deno - Permissions issue."}
        except Exception as e:
            log(f"[Error] Failed to replace Deno binary: {e}")
            return {"success": False, "message": f"Failed to update Deno: {e}"}

def encode_worker(cmd, duration, out_path):
    # log(f"[Debug] Starting FFmpeg with: {' '.join(cmd)}")
    try:
        global current_encoder
        log(f"[TempInfo] CMD actually being run: {cmd}")
        log(f"[TempInfo] Duration: {duration} -- Output path: {out_path}")
        ff = FfmpegProgress(cmd)
        log("[Debug] FFmpegProgress object created.")
        current_encoder = ff
        try:
            for progress in ff.run_command_with_progress():
                # log(f"[TempInfo] progress is: {progress}")
                fixedduration = int(float(duration))
                # log(f"[TempInfo] fixed duration is: {fixedduration}")
                pct = max(progress, 0.1) / 100
                # log(f"[TempInfo] pct is: {pct}")
                encoded = fixedduration * pct
                # log(f"[TempInfo] encoded is: {encoded}")
                remaining = max(fixedduration - encoded, 0)
                # log(f"[TempInfo] remaining is: {remaining}")
                send_response({
                    "event": "progress",
                    "data": {
                        "percent": round(progress),
                        "encoded": round(encoded),
                        "remaining": round(remaining),
                    }
                })
        except Exception as e:
            log(traceback.format_exc())
            log(f"[Error] Re-encode failed: {e}")
            send_response({"success": False, "error": str(e)})
            
            log2.info("------ Failed Re-encode - Exiting ------")
            sys.exit(1)
        
        log(f"[Info] Successfully re-encoded file")
        send_response({"success": True, "output": out_path})
        log2.info("------ Finished Re-encode - Exiting ------")
        sys.exit(0)
    except Exception as e:
        log(f"[Error] FFMPEG failed to re-encode file: {e}")
        send_response({"success": False, "error": str(e)})
        
        log2.info("------ Failed Re-encode - Exiting ------")
        sys.exit(1)
    #finally:
        #current_encoder = None

# Receives messages from whatever is communicating with us.
# Depending on the message, it will do different things, as detailed below.
def main():
    try:
        CFG_PATH, DOWNLOAD_DIR, recovery_notice = load_config()
        global current_thread, msg
        # global current_encoder # it ain't supposed to be globalised here
        
        msg = read_message()
        log(f"[Info] Message received: {msg}")
        if not msg:
            log(f"[Error] No message received.")
            send_response({"status": "error", "message": "No message received."})
            return

        action = msg.get("action")
        dep = msg.get("dep")
        
        # "Hey, you. Download this URL, and here's a format key for you to figure out."
        if action == "download":
            log("[Info] New download started")
            url = msg.get("url")
            format_key = msg.get("format")
            datechecked = msg.get("datechecked")
            pagetype = msg.get("pagetype")
            result = run_download(url, format_key, datechecked, pagetype)
            if recovery_notice:
                result["recovery_notice"] = recovery_notice
            send_response(result)
        
        # "Please update the config with the download directory I provided."
        elif action == "update_config":
            new_config = msg.get("config", {})
            try:
                if is_valid_path(new_config["download_dir"]):
                    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
                    save_config(new_config)
                    log(f"Config updated: {new_config}")
                    send_response({"status": "success", "message": "Config updated."})
                else:
                    log(f"Invalid directory for update_config: {new_config}")
                    send_response({"status": "error", "message": "Invalid or missing directory path."})
            except Exception as e:
                log(f"Failed to write config.json: {e}")
                send_response({"status": "error", "message": str(e)})
        
        # "Where is the current download directory?"
        elif action == "get_config":
            try:
                log(f"[Info] Config is: {CFG_PATH}")
                send_response({"status": "success", "config": CFG_PATH, "recovery_notice": recovery_notice})
            except Exception as e:
                send_response({"status": "error", "message": str(e)})
        
        # "What are the file sizes of my download options here?"
        elif action == "get_file_sizes":
            log("[Info] Get file sizes started")
            url = msg.get("url")
            send_response(get_file_sizes(url))
        
        # "Let the user choose a file and validate that it's cool please."
        elif action == "reencode_pick_file":
            # Native file dialog -> probe -> return summary
            path = pick_file_dialog()
            if not path:
                send_response({"success": False, "error": "No file selected."})
                return
            ext = os.path.splitext(path)[1].lower()
            if ext not in SUPPORTED_INPUT_EXTS:
                send_response({"success": False, "error": f"Unsupported file type: {ext}"})
                return
            info = probe_file(path)
            log(f"[Info] File to re-encode's info: {info}")
            send_response(info)
        
        # "Start the re-encoding please."
        elif action == "reencode_start":
            log(f"[TempInfo] Got here")
            input_path = msg.get("input_path") # Input file path
            out_ext = msg.get("out_container") # Output file's container
            v_choice = msg.get("v_choice") # Video codec to re-encode to
            a_choice = msg.get("a_choice") # Audio codec to re-encode to
            final_bitrate_kbps = msg.get("final_bitrate_kbps") # Audio bitrate (kbps)
            attach_metadata = msg.get("attach_metadata") # Toggle whether to attach metadata (true/false)
            attach_chapters = msg.get("attach_chapters") # Toggle whether to attach chapters (true/false)
            crf_word = msg.get("crf") # low/default/high
            fps = msg.get("fps") # Currently unused pending further testing - Target FPS to re-encode to
            use_gpu = msg.get("use_gpu") # True/False
            gpu_type = msg.get("gpu_type") # nvidia/intel/amd
            v_width = msg.get("v_width") # Input video's width
            v_height = msg.get("v_height") # Input video's height
            v_fps = msg.get("v_fps") # Input video's framerate
            duration = msg.get("duration") # Input video's duration in seconds (no decimals either)
            
            def validateIfThisIsAValidNumber(num, type):
                try:
                    #if type(num) == int or type(num) == float or type(num) == str:
                    if isinstance(num, (int, float, str)):
                        if 1 <= num <= 1000:
                            log(f"[TempInfo] {type} is {num}")
                            return num
                        else:
                            log(f"[Error] {type} is not within expected bounds. How did you manage that?")
                            send_response({"success": False, "error": f"{type} is not within expected bounds. How did you manage that?"})
                            sys.exit()
                    else:
                        log(f"[Info] {type} has not been set. This can be fine if this is intentional. Assuming default values for {type}.")
                        return None
                except Exception as e:
                    log(f"[Error] Failed to validate {type} input: {e}")
                    #send_response({"success": False, "error": f"Failed to validate {type} input: {e}"})
                    return None
            
            fps = validateIfThisIsAValidNumber(fps, "FPS")
            
            if not os.path.isfile(input_path):
                send_response({"success": False, "error": "Input file missing."})
                return
            
            base = os.path.splitext(os.path.basename(input_path))[0]
            out_name = f"{base}_re{out_ext}"
            out_path = os.path.join(DOWNLOAD_DIR, out_name)
            log(f"[TempInfo] Got here 2")
            cmd = build_ffmpeg_cmd(
                input_path, out_path, v_choice, a_choice, final_bitrate_kbps, attach_metadata, attach_chapters, fps,
                use_gpu, gpu_type, crf_word, v_width, v_height, v_fps
            )
            log(f"[Info] Re-encode start: {' '.join(cmd)}")
            
            current_thread = threading.Thread(
                target=encode_worker,
                args=(cmd, duration, out_path),
                daemon=False # was True
                # I can't figure out why it didn't like being True. Refreshing the page still ends the re-encode so it's whatever I guess.
            )
            current_thread.start()
        
        elif action == "reencode_stop":
            #global current_encoder
            log("[TempInfo] Received request to stop re-encode")
            current_encoder = None # COMMENT THIS OUT, DEBUG ONLY
            if current_encoder is not None:
                try:
                    current_encoder.quit_gracefully()
                    log("[TempInfo] Sent FFmpeg request to quit gracefully")
                    send_response({"event": "stopping"})
                    
                    log2.info("------ Ended Re-encode - Exiting ------")
                    sys.exit(0)
                except Exception as e:
                    log(f"[Error] Failed to stop FFmpeg's re-encode: {str(e)}")
                    send_response({"success": False, "error": str(e)})
                    
                    log2.info("------ Failed to stop Re-encode - Exiting ------")
                    sys.exit(1)
            else:
                log("[TempInfo] There isn't an active encode (If you're seeing this, that's bad)")
                #send_response({"success": False, "error": "No active encode"})
                
                #log2.info("------ Failed Re-encode - Exiting ------")
                #sys.exit(1)
        
        # --- New Dependency Checker Table ---
        #
        # For just these three: You will receive 'action' and 'dep'
        # "ffmpeg", "ytdlp", "native"
        # New dependency table, Step 1: Get local version of a dependency
        elif action == "getLocalVersion":
            func = globals().get(f"get_local_{dep}_version")
            if func:
                localver = func()
                if localver:
                    log2.info(f"[Info] Local {dep} version: {localver}")
                    send_response({
                        "status": "success",
                        "success": True,
                        "local": str(localver),
                        "message": f"Successfully found {dep} current version"
                    })
                else:
                    log(f"[Error] Could not determine local {dep} version")
                    send_response({
                        "status": "error",
                        "success": False,
                        "local": "Error",
                        "message": f"Could not determine local {dep} version"
                    })
            else:
                log(f"[Error] Unknown dependency type: {dep}")
                send_response({
                    "status": "error",
                    "success": False,
                    "local": "Error",
                    "message": f"Unknown dependency: {dep}"
                })
        
        # New dependency table, Step 2: Check for updates of a dependency, comparing local vs remote
        # Yep it's an entirely different layout lol
        elif action == "checkUpdates":
            if dep == "ffmpeg":
                send_response(check_ffmpeg_update_available())
            
            # For yt-dlp.exe I have to compare the versions here because it was dumber back when I wrote it
            # TODO: you can totes move this to a def to make it look neater!
            elif dep == "ytdlp":
                local = get_local_ytdlp_version()
                latest = get_latest_ytdlp_version()
                
                if local != latest:
                    log(f"[Info] An update for YT-DLP is available. (Local: {local}, Latest: {latest})")
                    send_response({
                        "status": "success",
                        "local": local,
                        "latest": latest,
                        "update_available": True,
                        "message": "An update for YT-DLP is available."
                    })
                else:
                    log(f"[Info] YT-DLP already up to date. (Local: {local}, Latest: {latest})")
                    send_response({
                        "status": "success",
                        "local": local,
                        "latest": latest,
                        "update_available": False,
                        "message": "YT-DLP is up to date."
                    })
            
            elif dep == "deno":
                send_response(check_deno_update_available())
            
            elif dep == "native":
                compare_local_vs_github("ytdlp_host")
            
            elif dep == "nc_updater":
                compare_local_vs_github("nc_updater")
        
        # New dependency table, Step 3: Update a dependency / Download if it doesn't exist yet
        
        # TODO: Does not have great checks against if the user is being ratelimited by Github somehow.
        # Not a critical issue, as at worst it'll just try (and probably fail) to update despite already being on the latest version.
        elif action == "updateDependency":
            if dep == "ffmpeg":
                send_response(update_ffmpeg())
            
            elif dep == "ytdlp":
                send_response(download_latest_ytdlp())
            
            elif dep == "deno":
                send_response(update_deno())
            
            elif dep == "native":
                log("[Notice] You are trying to update the Native Client with the wrong script!")
                send_response({"status": "error", "success": False, "message": "You are trying to update the Native Client with the wrong script!"})
            
            elif dep == "nc_updater":
                update_nc_updater()
            
        # ping
        elif action == "ping":
            log("[Info] pong!")
            send_response({
                "status": "success",
                "success": True,
                "message": "pong"
            })
        
        # Opens a file explorer window to choose a folder for the download folder picker
        elif action == "pickDownloadFolder":
            try:
                root = tk.Tk()
                root.withdraw()
                path = filedialog.askdirectory(title="Select your download folder")
                log(f"[Info] File chosen to convert: {path}")
                root.update_idletasks()
                root.destroy()
                
                send_response({
                    "status": "success",
                    "success": True,
                    "path": path
                })
            except Exception as e:
                log(f"[Error] Failed to pick download path dialog: {e}")
                send_response({
                    "status": "error",
                    "success": False
                })
        
        elif action == "open_defender":
            try:
                os.startfile("windowsdefender://exclusions")
                send_response({"success": true})
            except Exception as e:
                send_response({"success": false, "message": e})
        
        else:
            log("[Error] Unknown action message type")
            send_response({"status": "error", "success": False, "message": "Unknown action message type."})
    except Exception as e:
        log(f"Stub crashed: {str(e)}")
        send_response({"status": "error", "message": "Stub crashed. See log."})

if __name__ == "__main__":
    log2.info("------ Native Client Started ------")
    # log2.debug("Debug message")
    # log2.info("Info message")
    # log2.warning("Warning message")
    # log2.error("Error message")
    # log2.critical("Critical message")
    try:
        main()
        
        #msg = read_message()
        #log2.info(f"second msg is {msg}")
        action = msg.get("action")
        if action not in ("reencode_start", "reencode_stop"):
            log2.info("------ Native Client Finished ------")
            sys.exit(0)
        else: # Doesn't sys.exit so the port stays open1
            log2.info("It was going to sys exit but the port must remain open!")
    except Exception as e:
        log(f"[Fatal Error] Native Client failed somehow: {e}")
        sys.exit(1)
