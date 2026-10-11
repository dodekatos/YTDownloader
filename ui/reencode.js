/* YTDownloader - A browser addon for downloading videos from websites.
Copyright (C) 2025-2026 dodekatos

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */

"use strict";

const NATIVE_HOST_NAME = "ytdlp_host";

const METER_SEGMENTS = 24; // How many segments to use in the currently active re-encode progress bar

// ---- DOM references -------------------------------------------------------------
const els = {
  statusLed: document.getElementById("statusLed"),
  statusLabel: document.getElementById("statusLabel"),
  addFilesBtn: document.getElementById("addFilesBtn"),
  addFolderBtn: document.getElementById("addFolderBtn"),
  stopAllBtn: document.getElementById("stopAllBtn"),
  shortcutsEnabled: document.getElementById("shortcutsEnabled"),
  shortcutsTable: document.getElementById("shortcutsTable"),
  pendingList: document.getElementById("pendingList"),
  pendingEmpty: document.getElementById("pendingEmpty"),
  pendingCount: document.getElementById("pendingCount"),
  clearPendingBtn: document.getElementById("clearPendingBtn"),
  queueList: document.getElementById("queueList"),
  queueEmpty: document.getElementById("queueEmpty"),
  queueCount: document.getElementById("queueCount"),
  toastContainer: document.getElementById("toastContainer"),
  pendingCardTemplate: document.getElementById("pendingCardTemplate"),
  queueItemTemplate: document.getElementById("queueItemTemplate"),
};

// ---- State -----------------------------------------------------------------------
let port = null;
let nextLocalId = 1;
let nextRequestId = 1;

// pending (not-yet-queued) file cards, keyed by a client-side local id
const pendingFiles = new Map(); // localId -> { localId, probe, root, f: {...field elements...} }

// jobs the server has accepted into the queue, keyed by job_id
const queueJobs = new Map(); // job_id -> { job_id, filename, state: 'queued'|'active', percent, elapsed, remaining, output }
let activeJobId = null;

// requests awaiting a reply, keyed by the request_id we sent
const pendingRequests = new Map(); // request_id -> { resolve, action }

/* ==================================================================================
   Native messaging connection
   ================================================================================== */

function connectNative() {
  setConnectionState("connecting");
  try {
    port = browser.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (err) {
    console.error("connectNative threw:", err);
    setConnectionState("disconnected");
    return;
  }

  port.onMessage.addListener(handlePortMessage);
  port.onDisconnect.addListener(handlePortDisconnect);
  setConnectionState("connected");
}

function handlePortDisconnect() {
  const err = browser.runtime.lastError || (port && port.error);
  if (err) {
    console.error("Native port disconnected:", err.message || err);
  }
  port = null;
  setConnectionState("disconnected");

  // Any requests we were waiting on will never get a reply now - fail them so the UI doesn't hang.
  for (const [requestId, entry] of pendingRequests) {
    entry.resolve({ success: false, error: "Lost connection to the native client." });
  }
  pendingRequests.clear();

  showToast("Lost connection to the native client. Click the status label to reconnect.", "error");
}

function setConnectionState(state) {
  els.statusLed.classList.remove("connected", "connecting", "disconnected");
  els.statusLed.classList.add(state);
  const labels = { connected: "Connected", connecting: "Connecting…", disconnected: "Disconnected" };
  els.statusLabel.textContent = labels[state] || state;
}

// Sends a message and resolves with whatever reply carries the same request_id.
// Async job_* push events are handled separately in handlePortMessage and never resolve this.
function sendRequest(payload) {
  return new Promise((resolve) => {
    if (!port) {
      resolve({ success: false, error: "Not connected to the native client." });
      return;
    }
    const requestId = `r${nextRequestId++}`;
    pendingRequests.set(requestId, { resolve, action: payload.action });
    try {
      port.postMessage({ ...payload, request_id: requestId });
    } catch (err) {
      pendingRequests.delete(requestId);
      resolve({ success: false, error: String(err) });
    }
  });
}

const JOB_EVENT_TYPES = new Set(["job_started", "progress", "job_complete", "job_error", "job_stopped"]);
const bufferedJobEvents = new Map(); // job_id -> [msg, ...], for events that arrived before we knew about the job

function handlePortMessage(msg) {
  if (!msg) return;

  if (msg.event) {
    // Defensive: a job_* event can in principle arrive before the queue_add reply that tells
    // us this job_id exists. Buffer it and replay once the job is actually registered, instead
    // of silently dropping it (which used to make the very first job's progress bar never appear).
    if (JOB_EVENT_TYPES.has(msg.event) && !queueJobs.has(msg.job_id)) {
      if (!bufferedJobEvents.has(msg.job_id)) bufferedJobEvents.set(msg.job_id, []);
      bufferedJobEvents.get(msg.job_id).push(msg);
      return;
    }
    switch (msg.event) {
      case "job_started": return onJobStarted(msg);
      case "progress": return onJobProgress(msg);
      case "job_complete": return onJobComplete(msg);
      case "job_error": return onJobError(msg);
      case "job_stopped": return onJobStopped(msg);
      default: return;
    }
  }

  if (msg.request_id && pendingRequests.has(msg.request_id)) {
    const { resolve } = pendingRequests.get(msg.request_id);
    pendingRequests.delete(msg.request_id);
    resolve(msg);
    return;
  }

  // A reply with no request_id (shouldn't normally happen for the reencode actions, but
  // don't silently eat it either - surface it for debugging).
  console.warn("Unmatched native message:", msg);
}

/* ==================================================================================
   Add Files / Add Folder
   ================================================================================== */

els.addFilesBtn.addEventListener("click", async () => {
  await runPicker(els.addFilesBtn, { action: "reencode_pick_files" });
});

els.addFolderBtn.addEventListener("click", async () => {
  await runPicker(els.addFolderBtn, { action: "reencode_pick_folder" });
});

async function runPicker(button, payload) {
  if (!port) connectNative();
  button.disabled = true;
  try {
    const res = await sendRequest(payload);
    if (!res.success) {
      if (res.error) showToast(res.error, "error");
      return;
    }
    const files = res.files || [];
    for (const probe of files) addPendingCard(probe);
  } finally {
    button.disabled = false;
  }
}

/* ==================================================================================
   Pending file cards
   ================================================================================== */

function addPendingCard(probe) {
  const localId = `p${nextLocalId++}`;
  const root = els.pendingCardTemplate.content.firstElementChild.cloneNode(true);

  const f = {
    filename: root.querySelector('[data-role="filename"]'),
    removeBtn: root.querySelector('[data-role="remove-btn"]'),
    metaStrip: root.querySelector('[data-role="meta-strip"]'),
    configGrid: root.querySelector(".config-grid"),
    cropRow: root.querySelector(".crop-row"),
    toggleRows: root.querySelector(".toggle-rows"),
    footer: root.querySelector(".file-card-footer"),
    container: root.querySelector('[data-role="container"]'),
    vcodecField: root.querySelector('[data-role="vcodec-field"]'),
    vcodec: root.querySelector('[data-role="vcodec"]'),
    acodecField: root.querySelector('[data-role="acodec-field"]'),
    acodec: root.querySelector('[data-role="acodec"]'),
    encoderField: root.querySelector('[data-role="encoder-field"]'),
    encoder: root.querySelector('[data-role="encoder"]'),
    gpuDecodeRow: root.querySelector('[data-role="gpu-decode-row"]'),
    gpuDecodeEnabled: root.querySelector('[data-role="gpu-decode-enabled"]'),
    audioBitrateRow: root.querySelector('[data-role="audio-bitrate-row"]'),
    audioBitrateEnabled: root.querySelector('[data-role="audio-bitrate-enabled"]'),
    audioBitrateValue: root.querySelector('[data-role="audio-bitrate-value"]'),
    audioBitrateHint: root.querySelector('[data-role="audio-bitrate-hint"]'),
    audioBitrateWarnRow: root.querySelector('[data-role="audio-bitrate-warn-row"]'),
    audioBitrateWarn: root.querySelector('[data-role="audio-bitrate-warn"]'),
    timelapseSection: root.querySelector('[data-role="timelapse-section"]'),
    timelapseEnabled: root.querySelector('[data-role="timelapse-enabled"]'),
    timelapseControls: root.querySelector('[data-role="timelapse-controls"]'),
    timelapseDuration: root.querySelector('[data-role="timelapse-duration"]'),
    timelapseMultiplier: root.querySelector('[data-role="timelapse-multiplier"]'),
    timelapseNotices: root.querySelector('[data-role="timelapse-notices"]'),
    qualityField: root.querySelector('[data-role="quality-field"]'),
    quality: root.querySelector('[data-role="quality"]'),
    resolutionField: root.querySelector('[data-role="resolution-field"]'),
    resolutionPreset: root.querySelector('[data-role="resolution-preset"]'),
    resolutionDimsField: root.querySelector('[data-role="resolution-dims-field"]'),
    resolutionWidth: root.querySelector('[data-role="resolution-width"]'),
    resolutionHeight: root.querySelector('[data-role="resolution-height"]'),
    cropEnabled: root.querySelector('[data-role="crop-enabled"]'),
    cropStart: root.querySelector('[data-role="crop-start"]'),
    cropEnd: root.querySelector('[data-role="crop-end"]'),
    fpsRow: root.querySelector('[data-role="fps-row"]'),
    fpsEnabled: root.querySelector('[data-role="fps-enabled"]'),
    fpsValue: root.querySelector('[data-role="fps-value"]'),
    fpsHint: root.querySelector('[data-role="fps-hint"]'),
    keepMetadata: root.querySelector('[data-role="keep-metadata"]'),
    keepChapters: root.querySelector('[data-role="keep-chapters"]'),
    addBtn: root.querySelector('[data-role="add-to-queue-btn"]'),
  };

  f.filename.textContent = probe.filename || (probe.path ? probe.path.split(/[\\/]/).pop() : "Unknown file");
  f.filename.title = probe.path || "";

  const entry = { localId, probe, root, f };
  pendingFiles.set(localId, entry);

  if (!probe.success) {
    renderProbeFailure(entry);
  } else {
    renderProbeSuccess(entry);
    wireCardControls(entry);
  }

  f.removeBtn.addEventListener("click", () => removePendingCard(localId));

  els.pendingList.appendChild(root);
  refreshPendingVisibility();
}

function renderProbeFailure(entry) {
  const { f, probe } = entry;
  f.configGrid.hidden = true;
  f.cropRow.hidden = true;
  f.toggleRows.hidden = true;
  f.footer.hidden = true;
  const span = document.createElement("span");
  span.className = "meta-error";
  span.textContent = probe.error || "Couldn't read this file.";
  f.metaStrip.appendChild(span);
}

function renderProbeSuccess(entry) {
  const { f, probe } = entry;
  const chips = [];
  if (probe.container) chips.push({ text: probe.container.toUpperCase() });
  if (probe.has_video) {
    let res = "";
    if (probe.video_width && probe.video_height) res = `${probe.video_width}x${probe.video_height}`;
    if (probe.video_fps) res += (res ? " @ " : "") + `${probe.video_fps}fps`;
    if (res) chips.push({ text: res, cls: "v-domain" });
    if (probe.video_codec) chips.push({ text: probe.video_codec.toUpperCase(), cls: "v-domain" });
    if (probe.video_bitrate_kbps) chips.push({ text: `${probe.video_bitrate_kbps} kbps`, cls: "v-domain" });
  }
  if (probe.has_audio) {
    if (probe.audio_codec) chips.push({ text: probe.audio_codec.toUpperCase(), cls: "a-domain" });
    if (probe.audio_bitrate_kbps) chips.push({ text: `${probe.audio_bitrate_kbps} kbps`, cls: "a-domain" });
  }
  if (probe.duration_display) chips.push({ text: probe.duration_display });
  if (probe.file_size_display) chips.push({ text: probe.file_size_display });

  for (const chip of chips) {
    const span = document.createElement("span");
    span.className = "meta-chip" + (chip.cls ? " " + chip.cls : "");
    span.textContent = chip.text;
    f.metaStrip.appendChild(span);
  }
}

// --- Audio bitrate quality tier definitions ---
// Edit these ranges to adjust the guidance text and colours shown next to the bitrate input.
// Tiers are checked in order; the first one where kbps <= max wins.
// CSS classes: ab-bad (red), ab-low (orange), ab-ok (yellow), ab-good (green), ab-great (dark green), ab-warn (yellow)
const AUDIO_BITRATE_TIERS = [
  { max:  47, text: "Very low — are you sure you want audio this bad?",   cls: "ab-bad"   },
  { max:  95, text: "Low — are you sure you want it this low?",           cls: "ab-low"   },
  { max: 127, text: "Acceptable for archival or podcast use.",            cls: "ab-ok"    },
  { max: 191, text: "Good bitrate.",                                      cls: "ab-good"  },
  { max: 319, text: "High — good for high quality music.",                cls: "ab-great" },
  { max: 999, text: "Very high — are you sure you need this?",            cls: "ab-warn"  },
];

function updateAudioBitrateHint(entry) {
  const { f, probe } = entry;
  const raw = f.audioBitrateValue.value;
  const kbps = parseInt(raw, 10);

  // Reset
  f.audioBitrateHint.textContent = "";
  f.audioBitrateHint.className = "ab-hint";
  f.audioBitrateWarnRow.hidden = true;
  f.audioBitrateWarn.textContent = "";

  if (!f.audioBitrateEnabled.checked || isNaN(kbps) || kbps <= 0) return;

  // Quality tier hint
  const tier = AUDIO_BITRATE_TIERS.find(t => kbps <= t.max);
  if (tier) {
    f.audioBitrateHint.textContent = tier.text;
    f.audioBitrateHint.classList.add(tier.cls);
  }

  // Exceeds-source warning (if probe has a known audio bitrate)
  if (probe.audio_bitrate_kbps && kbps > probe.audio_bitrate_kbps) {
    f.audioBitrateWarn.textContent =
      `${kbps} kbps exceeds the source's detected audio bitrate of ${probe.audio_bitrate_kbps} kbps. ` +
      `This won't improve quality — it'll just make the file larger.`;
    f.audioBitrateWarnRow.hidden = false;
  }
}

// --- HH:MM:SS ↔ seconds helpers (client-side) ---

function hmsToSeconds(hms) {
  const parts = hms.trim().split(":");
  if (parts.length !== 3) return null;
  const [h, m, s] = parts.map(Number);
  if ([h, m, s].some(isNaN)) return null;
  return h * 3600 + m * 60 + s;
}

function secondsToHms(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds < 0) return "";
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// Returns the source duration in seconds to use for timelapse calculations:
// the clipped duration if both clip fields are valid, otherwise the full probe duration.
function getSourceDurationForTimelapse(entry) {
  const { f, probe } = entry;
  if (f.cropEnabled.checked) {
    const start = hmsToSeconds(f.cropStart.value);
    const end = hmsToSeconds(f.cropEnd.value);
    if (start != null && end != null && end > start) return end - start;
  }
  return probe.duration ? parseFloat(probe.duration) : null;
}

// Builds the inline notice divs for the timelapse section
function updateTimelapseNotices(entry) {
  const { f } = entry;
  f.timelapseNotices.innerHTML = "";

  const mult = parseFloat(f.timelapseMultiplier.value);
  if (isNaN(mult) || mult <= 0) return;

  const addNotice = (msg, type) => {
    const el = document.createElement("div");
    el.className = `tl-notice ${type}`;
    el.textContent = msg;
    f.timelapseNotices.appendChild(el);
  };

  if (mult > 100) {
    addNotice("Audio will be disabled — this speed exceeds ffmpeg's maximum audio tempo limit (100×).", "error");
  } else if (mult < 0.5) {
    addNotice("Audio will be disabled — this speed is below ffmpeg's minimum audio tempo limit (0.5×).", "error");
  } else if (mult > 5) {
    addNotice("At this speed, audio may be too distorted or loud to comfortably hear. Consider setting audio to None.", "warn");
  }

  if (mult < 1 && mult >= 0.5) {
    addNotice("This will slow the video down rather than speed it up — double-check your values if that's not intentional. It'll still work.", "info");
  }
}

// Called when the user checks timelapse — auto-switches incompatible codecs
// Applies or removes timelapse option restrictions: disables vcodec Copy/None,
// acodec Copy, and AMV container when timelapse is active so the user simply
// cannot pick incompatible options rather than being intercepted after the fact.
function applyTimelapseOptionRestrictions(entry, enable) {
  const { f } = entry;
  setOptionDisabled(f.vcodec, "copy", enable);
  setOptionDisabled(f.vcodec, "none", enable);
  setOptionDisabled(f.acodec, "copy", enable);
  setOptionDisabled(f.container, "amv", enable);
  setOptionDisabled(f.container, "m4a", enable);
  setOptionDisabled(f.container, "mp3", enable);

  if (enable) {
    // Silently move off any now-disabled selection
    if (f.vcodec.value === "copy" || f.vcodec.value === "none") {
      f.vcodec.value = "libsvtav1";
      f.vcodec.dispatchEvent(new Event("change"));
    }
    if (f.acodec.value === "copy") {
      f.acodec.value = "aac";
      f.acodec.dispatchEvent(new Event("change"));
    }
    if (f.container.value === "amv") {
      f.container.value = "mkv";
      f.container.dispatchEvent(new Event("change"));
    }
  }
}

function onTimelapseEnabled(entry) {
  const { f } = entry;
  applyTimelapseOptionRestrictions(entry, true);
  f.timelapseControls.hidden = false;
  updateTimelapseNotices(entry);
}

// Called when timelapse is unchecked — clears everything and restores options
function onTimelapseDisabled(entry) {
  const { f } = entry;
  applyTimelapseOptionRestrictions(entry, false);
  f.timelapseControls.hidden = true;
  f.timelapseDuration.value = "";
  f.timelapseMultiplier.value = "";
  f.timelapseNotices.innerHTML = "";
}

// Syncs duration → multiplier (called when the user edits the duration field)
function syncDurationToMultiplier(entry) {
  const { f } = entry;
  const srcDur = getSourceDurationForTimelapse(entry);
  if (!srcDur) return;
  const targetSec = hmsToSeconds(f.timelapseDuration.value);
  if (!targetSec || targetSec <= 0) return;
  const mult = srcDur / targetSec;
  f.timelapseMultiplier.value = parseFloat(mult.toFixed(4));
  updateTimelapseNotices(entry);
}

// Syncs multiplier → duration (called when the user edits the multiplier field)
function syncMultiplierToDuration(entry) {
  const { f } = entry;
  const srcDur = getSourceDurationForTimelapse(entry);
  if (!srcDur) return;
  const mult = parseFloat(f.timelapseMultiplier.value);
  if (isNaN(mult) || mult <= 0) return;
  f.timelapseDuration.value = secondsToHms(srcDur / mult);
  updateTimelapseNotices(entry);
}

function wireCardControls(entry) {
  const { f, probe } = entry;

  // Disable container options that don't make sense for this input
  if (!probe.has_video) setOptionDisabled(f.container, "amv", true);
  if (!probe.has_audio) {
    setOptionDisabled(f.container, "m4a", true);
    setOptionDisabled(f.container, "mp3", true);
  }

  f.container.value = probe.has_video ? "mkv" : "m4a";

  f.container.addEventListener("change", () => updateFieldVisibility(entry));
  f.vcodec.addEventListener("change", () => updateFieldVisibility(entry));
  f.encoder.addEventListener("change", () => updateFieldVisibility(entry));
  // Audio codec drives showAudioBitrate too (only aac/libmp3lame get a bitrate row) - without
  // this listener, switching acodec from e.g. "copy" to "aac" left the row stuck hidden from
  // its initial state, silently dropping any custom bitrate the user tried to set.
  f.acodec.addEventListener("change", () => updateFieldVisibility(entry));
  f.cropEnabled.addEventListener("change", () => {
    f.cropStart.disabled = !f.cropEnabled.checked;
    f.cropEnd.disabled = !f.cropEnabled.checked;
  });

  f.resolutionPreset.addEventListener("change", () => applyResolutionPreset(entry, f.resolutionPreset.value));
  f.resolutionWidth.addEventListener("input", () => markResolutionCustomIfMismatched(entry));
  f.resolutionHeight.addEventListener("input", () => markResolutionCustomIfMismatched(entry));
  applyResolutionPreset(entry, "original");

  f.fpsEnabled.addEventListener("change", () => {
    f.fpsValue.disabled = !f.fpsEnabled.checked;
    if (f.fpsEnabled.checked) {
      if (!f.fpsValue.value) {
		f.fpsValue.value = "30";
      }
      clampFpsField(entry);
    } else {
      f.fpsHint.textContent = "";
    }
  });
  f.fpsValue.addEventListener("change", () => clampFpsField(entry));

  // Audio bitrate wiring
  f.audioBitrateEnabled.addEventListener("change", () => {
    f.audioBitrateValue.disabled = !f.audioBitrateEnabled.checked;
    if (!f.audioBitrateEnabled.checked) {
      f.audioBitrateValue.value = "";
      updateAudioBitrateHint(entry);
    }
  });
  f.audioBitrateValue.addEventListener("input", () => {
    // Auto-correct 0 to 1, strip decimals
    let v = parseInt(f.audioBitrateValue.value, 10);
    if (!isNaN(v) && v <= 0) { f.audioBitrateValue.value = 1; }
    updateAudioBitrateHint(entry);
  });

  // Timelapse wiring
  f.timelapseEnabled.addEventListener("change", () => {
    if (f.timelapseEnabled.checked) {
      onTimelapseEnabled(entry);
    } else {
      onTimelapseDisabled(entry);
    }
  });
  f.timelapseDuration.addEventListener("input", () => syncDurationToMultiplier(entry));
  f.timelapseMultiplier.addEventListener("input", () => syncMultiplierToDuration(entry));
  // Clip field changes should re-sync the timelapse duration if timelapse is active
  f.cropStart.addEventListener("change", () => { if (f.timelapseEnabled.checked) syncMultiplierToDuration(entry); });
  f.cropEnd.addEventListener("change", () => { if (f.timelapseEnabled.checked) syncMultiplierToDuration(entry); });
  f.cropEnabled.addEventListener("change", () => { if (f.timelapseEnabled.checked) syncMultiplierToDuration(entry); });

  f.addBtn.addEventListener("click", () => onAddToQueueClick(entry));

  updateFieldVisibility(entry);
}

// Height comes from the chosen preset; width is derived from the source's actual aspect ratio
// rather than assuming 16:9, so non-widescreen sources (portrait phone video, 4:3, etc.) don't
// come out stretched. Both get rounded down to even numbers - most codecs require it.
function applyResolutionPreset(entry, presetValue) {
  const { f, probe } = entry;

  if (presetValue === "original") {
    f.resolutionWidth.value = probe.video_width || "";
    f.resolutionHeight.value = probe.video_height || "";
    f.resolutionWidth.disabled = true;
    f.resolutionHeight.disabled = true;
    return;
  }

  f.resolutionWidth.disabled = false;
  f.resolutionHeight.disabled = false;

  if (presetValue === "custom") return; // leave whatever's currently typed in alone

  const targetHeight = parseInt(presetValue, 10);
  let targetWidth = targetHeight;
  if (probe.video_width && probe.video_height) {
    targetWidth = Math.round((probe.video_width / probe.video_height) * targetHeight);
  }
  f.resolutionWidth.value = targetWidth - (targetWidth % 2);
  f.resolutionHeight.value = targetHeight - (targetHeight % 2);
}

// If the user hand-edits width/height away from what the selected preset would produce,
// flip the dropdown to "Custom" so it doesn't keep claiming a label that no longer applies.
function markResolutionCustomIfMismatched(entry) {
  const { f, probe } = entry;
  const preset = f.resolutionPreset.value;
  if (preset === "original" || preset === "custom") return;

  const targetHeight = parseInt(preset, 10);
  let expectedWidth = targetHeight;
  if (probe.video_width && probe.video_height) {
    expectedWidth = Math.round((probe.video_width / probe.video_height) * targetHeight);
  }
  expectedWidth -= expectedWidth % 2;
  const expectedHeight = targetHeight - (targetHeight % 2);

  const curW = parseInt(f.resolutionWidth.value, 10);
  const curH = parseInt(f.resolutionHeight.value, 10);
  if (curW !== expectedWidth || curH !== expectedHeight) {
    f.resolutionPreset.value = "custom";
  }
}

// Bounds the FPS field to 1-999, and caps it to the source's FPS since asking for more than
// the source actually has just means ffmpeg duplicates frames for no real benefit.
function clampFpsField(entry) {
  const { f, probe } = entry;
  let val = parseInt(f.fpsValue.value, 10);
  if (isNaN(val)) {
    f.fpsHint.textContent = "";
    return;
  }
  val = Math.max(1, Math.min(999, val));
  // Don't cap to source FPS when timelapse is active — it's perfectly valid to output
  // at a much higher FPS than the source when creating a timelapse.
  const timelapseActive = !f.timelapseSection.hidden && f.timelapseEnabled.checked;
  if (!timelapseActive && probe.video_fps && val > probe.video_fps) {
    val = Math.max(1, Math.round(probe.video_fps));
    f.fpsHint.textContent = `Capped to source's ${probe.video_fps}fps`;
  } else {
    f.fpsHint.textContent = "";
  }
  f.fpsValue.value = val;
}

// Mirrors the container/codec compatibility rules enforced server-side in
// validate_reencode_config(), so the UI never lets the user build an invalid combination.
function updateFieldVisibility(entry) {
  const { f, probe } = entry;
  const container = f.container.value;

  setOptionDisabled(f.acodec, "aac", false);
  setOptionDisabled(f.acodec, "libmp3lame", false);
  setOptionDisabled(f.acodec, "none", false);

  if (container === "amv") {
    f.vcodecField.hidden = true;
    f.acodecField.hidden = true;
    f.encoderField.hidden = true;
    f.qualityField.hidden = true;
    setEncodeOnlyControlsVisible(entry, false);
    f.gpuDecodeRow.hidden = true;
    f.gpuDecodeEnabled.checked = false;
    f.timelapseSection.hidden = true;
    return;
  }

  if (container === "m4a" || container === "mp3") {
    f.vcodecField.hidden = true;
    f.vcodec.value = "none";
    f.acodecField.hidden = false;
    f.encoderField.hidden = true;
    f.qualityField.hidden = true;
    setEncodeOnlyControlsVisible(entry, false);
    f.gpuDecodeRow.hidden = true;
    f.gpuDecodeEnabled.checked = false;
    f.timelapseSection.hidden = true;

    if (container === "m4a") {
      const copyOk = probe.audio_codec === "aac";
      setOptionDisabled(f.acodec, "copy", !copyOk);
      setOptionDisabled(f.acodec, "libmp3lame", true);
      setOptionDisabled(f.acodec, "none", true);
      const allowed = copyOk ? ["aac", "copy"] : ["aac"];
      if (!allowed.includes(f.acodec.value)) f.acodec.value = "aac";
    } else {
      const copyOk = probe.audio_codec === "mp3";
      setOptionDisabled(f.acodec, "copy", !copyOk);
      setOptionDisabled(f.acodec, "aac", true);
      setOptionDisabled(f.acodec, "none", true);
      const allowed = copyOk ? ["libmp3lame", "copy"] : ["libmp3lame"];
      if (!allowed.includes(f.acodec.value)) f.acodec.value = "libmp3lame";
    }

    // m4a/mp3 always encode to aac/libmp3lame, so the bitrate row applies here too -
    // this branch used to return early and leave it stuck hidden.
    f.audioBitrateRow.hidden = false;
    return;
  }

  // MKV / MP4
  if (!probe.has_video) {
    f.vcodecField.hidden = true;
    f.vcodec.value = "none";
  } else {
    f.vcodecField.hidden = false;
  }
  f.acodecField.hidden = false;
  if (!probe.has_audio) {
    f.acodec.value = "none";
  } else if (f.vcodec.value === "none" && f.acodec.value === "none") {
    f.acodec.value = "copy";
  }

  const needsEncodeControls = ["libsvtav1", "libx265", "libx264"].includes(f.vcodec.value);
  f.encoderField.hidden = !needsEncodeControls;
  f.qualityField.hidden = !needsEncodeControls;
  setEncodeOnlyControlsVisible(entry, needsEncodeControls);

  const showGpuDecode = needsEncodeControls && f.encoder.value === "nvidia";
  f.gpuDecodeRow.hidden = !showGpuDecode;
  if (!showGpuDecode) f.gpuDecodeEnabled.checked = false;

  // Timelapse only available for video files
  f.timelapseSection.hidden = !probe.has_video;

  // Keep timelapse option restrictions in sync with the checkbox state
  applyTimelapseOptionRestrictions(entry, f.timelapseEnabled.checked);

  // Audio bitrate row: only meaningful when actually encoding audio to a bitrate-based codec
  const showAudioBitrate = ["aac", "libmp3lame"].includes(f.acodec.value);
  f.audioBitrateRow.hidden = !showAudioBitrate;
  if (!showAudioBitrate) {
    f.audioBitrateEnabled.checked = false;
    f.audioBitrateValue.disabled = true;
    f.audioBitrateValue.value = "";
    f.audioBitrateHint.textContent = "";
    f.audioBitrateHint.className = "ab-hint";
    f.audioBitrateWarnRow.hidden = true;
  }
}

// Resolution/FPS only make sense while actually re-encoding (never with stream copy, audio-only
// output, or AMV's fixed format) - shown/hidden together, and reset to safe defaults when hidden
// so a stale custom value can't quietly tag along if the user switches back later.
function setEncodeOnlyControlsVisible(entry, visible) {
  const { f } = entry;
  f.resolutionField.hidden = !visible;
  f.resolutionDimsField.hidden = !visible;
  f.fpsRow.hidden = !visible;
  if (!visible) {
    f.resolutionPreset.value = "original";
    applyResolutionPreset(entry, "original");
    f.fpsEnabled.checked = false;
    f.fpsValue.disabled = true;
    f.fpsValue.value = "";
    f.fpsHint.textContent = "";
  }
}

function setOptionDisabled(select, value, disabled) {
  const opt = Array.from(select.options).find((o) => o.value === value);
  if (opt) opt.disabled = disabled;
}

const TIMECODE_RE = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

async function onAddToQueueClick(entry) {
  const { f, probe, localId } = entry;

  if (f.cropEnabled.checked) {
    const startOk = TIMECODE_RE.test(f.cropStart.value.trim());
    const endOk = TIMECODE_RE.test(f.cropEnd.value.trim());
    if (!startOk || !endOk) {
      showToast("Clip start/end must be in HH:MM:SS format.", "error");
      return;
    }
  }

  const encodeControlsActive = !f.resolutionField.hidden;
  let targetWidth = null;
  let targetHeight = null;
  if (encodeControlsActive && f.resolutionPreset.value !== "original") {
    targetWidth = parseInt(f.resolutionWidth.value, 10);
    targetHeight = parseInt(f.resolutionHeight.value, 10);
    if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth < 16 || targetHeight < 16) {
      showToast("Enter a valid width and height, or set Resolution back to Original.", "error");
      return;
    }
  }

  let targetFps = null;
  if (encodeControlsActive && f.fpsEnabled.checked) {
    clampFpsField(entry);
    targetFps = parseInt(f.fpsValue.value, 10);
    if (!Number.isInteger(targetFps) || targetFps < 1 || targetFps > 999) {
      showToast("Custom FPS must be a whole number between 1 and 999.", "error");
      return;
    }
  }

  let timelapseMult = null;
  if (!f.timelapseSection.hidden && f.timelapseEnabled.checked) {
    const rawMult = parseFloat(f.timelapseMultiplier.value);
    if (isNaN(rawMult) || rawMult <= 0) {
      showToast("Enter a valid speed multiplier for the timelapse (e.g. 2.0 for 2× speed).", "error");
      f.addBtn.disabled = false;
      f.addBtn.textContent = "Add to Queue →";
      return;
    }
    timelapseMult = rawMult;
  }

  f.addBtn.disabled = true;
  f.addBtn.textContent = "Adding…";

  const payload = {
    action: "reencode_queue_add",
    input_path: probe.path,
    out_container: f.container.value,
    v_choice: f.vcodec.value,
    a_choice: f.acodec.value,
    final_bitrate_kbps: probe.final_bitrate_kbps,
    attach_metadata: f.keepMetadata.checked,
    attach_chapters: f.keepChapters.checked,
    crf: f.quality.value,
    use_gpu: f.encoder.value === "nvidia",
    gpu_type: "nvidia",
    duration: probe.duration,
    cropchecked: f.cropEnabled.checked,
    crop_start: f.cropEnabled.checked ? f.cropStart.value.trim() : null,
    crop_end: f.cropEnabled.checked ? f.cropEnd.value.trim() : null,
    target_width: targetWidth,
    target_height: targetHeight,
    target_fps: targetFps,
    source_fps: probe.video_fps || null,
    use_gpu_decode: !f.gpuDecodeRow.hidden && f.gpuDecodeEnabled.checked,
    timelapse_multiplier: timelapseMult,
    target_audio_bitrate_kbps: (!f.audioBitrateRow.hidden && f.audioBitrateEnabled.checked)
      ? (parseInt(f.audioBitrateValue.value, 10) || null)
      : null,
  };

  const res = await sendRequest(payload);

  if (!res.success) {
    showToast(res.error || "Failed to queue that file.", "error");
    f.addBtn.disabled = false;
    f.addBtn.textContent = "Add to Queue →";
    return;
  }

  addQueueJob({
    job_id: res.job_id,
    filename: entry.f.filename.textContent,
    state: "queued",
    percent: 0,
    elapsed: 0,
    remaining: null,
    output: res.output_path,
    summary: buildJobSummary(entry, payload),
  });
  removePendingCard(localId);
}

function removePendingCard(localId) {
  const entry = pendingFiles.get(localId);
  if (!entry) return;
  entry.root.remove();
  pendingFiles.delete(localId);
  refreshPendingVisibility();
}

function refreshPendingVisibility() {
  const count = pendingFiles.size;
  els.pendingCount.textContent = String(count);
  els.pendingEmpty.hidden = count > 0;
}

els.clearPendingBtn.addEventListener("click", () => {
  for (const localId of Array.from(pendingFiles.keys())) {
    removePendingCard(localId);
  }
});

/* ==================================================================================
   Processing queue
   ================================================================================== */

// Codec display names for the summary line
const VCODEC_LABELS = { libsvtav1: "AV1", libx265: "H.265", libx264: "H.264", copy: "Copy", none: "None", amv_v: "AMV" };
const ACODEC_LABELS = { aac: "AAC", libmp3lame: "MP3", copy: "Copy", none: "None", amv_a: "AMV" };
const CONTAINER_LABELS = { mkv: "MKV", mp4: "MP4", m4a: "M4A", mp3: "MP3", amv: "AMV" };

// Common aliases ffprobe reports that users don't recognise
const CONTAINER_ALIAS = { matroska: "MKV", "matroska,webm": "MKV", mov: "MOV", "mov,mp4,m4a,3gp,3g2,mj2": "MP4", mpegts: "TS", mpeg: "MPEG" };

function buildJobSummary(entry, payload) {
  const { probe, f } = entry;
  const rawContainer = (probe.container || "").split(",")[0].toLowerCase();
  const srcContainer = CONTAINER_ALIAS[probe.container?.toLowerCase()] || CONTAINER_ALIAS[rawContainer] || rawContainer.toUpperCase() || "?";
  const dstContainer = (CONTAINER_LABELS[payload.out_container] || payload.out_container.toUpperCase());

  // Resolution: source dims vs target (or "Copy" if unchanged)
  const srcRes = (probe.video_width && probe.video_height) ? `${probe.video_width}×${probe.video_height}` : null;
  let dstRes = "Copy";
  if (payload.target_width && payload.target_height) {
    dstRes = `${payload.target_width}×${payload.target_height}`;
  }

  // FPS
  const srcFps = probe.video_fps ? `${probe.video_fps}fps` : null;
  let dstFps = "Copy";
  if (payload.target_fps) dstFps = `${payload.target_fps}fps`;

  const vcodecLabel = VCODEC_LABELS[payload.v_choice] || payload.v_choice;
  const acodecLabel = ACODEC_LABELS[payload.a_choice] || payload.a_choice;

  return {
    srcContainer, dstContainer,
    srcRes, dstRes,
    srcFps, dstFps,
    vcodecSrc: probe.video_codec ? probe.video_codec.toUpperCase() : null,
    vcodecDst: vcodecLabel,
    acodecSrc: probe.audio_codec ? probe.audio_codec.toUpperCase() : null,
    acodecDst: acodecLabel,
    quality: { low: "Low Quality", default: "Default Quality", high: "High Quality" }[payload.crf] || payload.crf,
    showQuality: !["none", "copy", "amv_v"].includes(payload.v_choice),
    fileSizeDisplay: entry.probe.file_size_display || null,
    durationDisplay: entry.probe.duration_display || null,
    hasVideo: probe.has_video,
    hasAudio: probe.has_audio,
    clip: payload.cropchecked ? { start: payload.crop_start, end: payload.crop_end } : null,
    gpuDecode: payload.use_gpu_decode === true,
    keepMetadata: !!payload.attach_metadata,
    keepChapters: !!payload.attach_chapters,
    timelapse: payload.timelapse_multiplier != null ? `${parseFloat(payload.timelapse_multiplier).toFixed(3)}×` : null,
    customAudioBitrate: payload.target_audio_bitrate_kbps ? `${payload.target_audio_bitrate_kbps} kbps audio` : null,
  };
}

// Appends a styled span to a line element. isCopy dims the text; isFlag uses amber.
function _qsSpan(text, cls) {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

// Renders a "from → to" pair of spans, or just a single value if both are the same
// or `to` is "Copy" and the user hasn't actually changed anything.
function _qsSegment(lineEl, sep, srcText, dstText) {
  if (sep) lineEl.appendChild(_qsSpan(" · ", "qs-sep"));
  lineEl.appendChild(_qsSpan(srcText, "qs-from"));
  const isCopy = dstText === "Copy";
  lineEl.appendChild(_qsSpan(" → ", "qs-arrow"));
  lineEl.appendChild(_qsSpan(dstText, "qs-to" + (isCopy ? " copy" : "")));
}

function renderQueueSummary(summaryEl, line1El, line2El, s) {
  // --- Line 1: container · res · fps · vcodec · acodec ---
  let seg = 0;

  // Container (always shown, never "Copy" even if unchanged)
  _qsSegment(line1El, false, s.srcContainer, s.dstContainer);
  seg++;

  // Resolution (only shown for video files)
  if (s.hasVideo && s.srcRes) {
    _qsSegment(line1El, true, s.srcRes, s.dstRes);
    seg++;
  }

  // FPS (only shown for video files)
  if (s.hasVideo && s.srcFps) {
    _qsSegment(line1El, true, s.srcFps, s.dstFps);
    seg++;
  }

  // Video codec
  if (s.hasVideo && s.vcodecSrc) {
    _qsSegment(line1El, true, s.vcodecSrc, s.vcodecDst);
    seg++;
  }

  // Audio codec
  if (s.hasAudio && s.acodecSrc) {
    _qsSegment(line1El, true, s.acodecSrc, s.acodecDst);
    seg++;
  }

  // Quality (only shown when actually re-encoding video, not copy/none/amv)
  if (s.showQuality) {
    line1El.appendChild(_qsSpan(" · ", "qs-sep"));
    line1El.appendChild(_qsSpan(s.quality, "qs-to"));
  }

  // File size and duration — separated by a wider gap so they read as metadata, not settings
  if (s.fileSizeDisplay || s.durationDisplay) {
    const spacer = document.createElement("span");
    spacer.style.cssText = "flex: 1; min-width: 16px;";
    line1El.appendChild(spacer);
    const info = [s.fileSizeDisplay, s.durationDisplay].filter(Boolean).join("  ·  ");
    line1El.appendChild(_qsSpan(info, "qs-from"));
  }

  // --- Line 2: active flags only ---
  const flags = [];
  if (s.timelapse) flags.push(`Timelapse ${s.timelapse}`);
  if (s.customAudioBitrate) flags.push(s.customAudioBitrate);
  if (s.clip) flags.push(`Clip: ${s.clip.start} to ${s.clip.end}`);
  if (s.gpuDecode) flags.push("Decode on GPU too");
  if (s.keepMetadata) flags.push("Keep metadata");
  if (s.keepChapters) flags.push("Keep chapters");

  if (flags.length > 0) {
    flags.forEach((flag, i) => {
      if (i > 0) line2El.appendChild(_qsSpan(" · ", "qs-sep"));
      line2El.appendChild(_qsSpan(flag, "qs-flag"));
    });
  } else {
    line2El.hidden = true;
  }

  summaryEl.hidden = false;
}

function addQueueJob(job) {
  queueJobs.set(job.job_id, job);
  renderQueueList();

  const buffered = bufferedJobEvents.get(job.job_id);
  if (buffered) {
    bufferedJobEvents.delete(job.job_id);
    for (const bufferedMsg of buffered) handlePortMessage(bufferedMsg);
  }
}

function onJobStarted(msg) {
  const job = queueJobs.get(msg.job_id);
  if (!job) return; // shouldn't happen, but don't crash if it does
  job.state = "active";
  job.percent = 0;
  activeJobId = msg.job_id;
  renderQueueList();
}

function onJobProgress(msg) {
  const job = queueJobs.get(msg.job_id);
  if (!job) return;
  job.percent = msg.data?.percent ?? job.percent;
  job.elapsed = msg.data?.elapsed ?? job.elapsed;
  job.remaining = msg.data?.remaining ?? job.remaining;
  updateQueueItemProgress(job);
}

function onJobComplete(msg) {
  const job = queueJobs.get(msg.job_id);
  showCompletedToast(job?.filename || "file", msg.input_size ?? null, msg.output_size ?? null);
  queueJobs.delete(msg.job_id);
  if (activeJobId === msg.job_id) activeJobId = null;
  renderQueueList();
}

function onJobError(msg) {
  const job = queueJobs.get(msg.job_id);
  showToast(`Re-encode failed${job ? ` for ${job.filename}` : ""}: ${msg.error || "Unknown error"}`, "error");
  queueJobs.delete(msg.job_id);
  if (activeJobId === msg.job_id) activeJobId = null;
  renderQueueList();
}

function onJobStopped(msg) {
  const job = queueJobs.get(msg.job_id);
  showToast(`Stopped: ${job?.filename || "file"}`, "success");
  queueJobs.delete(msg.job_id);
  if (activeJobId === msg.job_id) activeJobId = null;
  renderQueueList();
}

els.stopAllBtn.addEventListener("click", async () => {
  els.stopAllBtn.disabled = true;
  try {
    const res = await sendRequest({ action: "reencode_stop_all" });
    if (!res.success && res.error) showToast(res.error, "error");
    // The server pushes job_stopped events for everything it removes/stops, which
    // will clear them out of queueJobs via onJobStopped as they arrive.
  } finally {
    els.stopAllBtn.disabled = false;
  }
});

async function stopActiveJob(jobId) {
  const res = await sendRequest({ action: "reencode_stop_current" });
  if (!res.success && res.error) showToast(res.error, "error");
}

async function removeQueuedJob(jobId) {
  const res = await sendRequest({ action: "reencode_queue_remove", job_id: jobId });
  if (res.success) {
    queueJobs.delete(jobId);
    renderQueueList();
  } else if (res.error) {
    showToast(res.error, "error");
  }
}

function renderQueueList() {
  els.queueList.innerHTML = "";

  const ordered = [];
  if (activeJobId && queueJobs.has(activeJobId)) ordered.push(queueJobs.get(activeJobId));
  for (const [jobId, job] of queueJobs) {
    if (jobId !== activeJobId) ordered.push(job);
  }

  ordered.forEach((job, idx) => {
    els.queueList.appendChild(buildQueueItemEl(job, idx));
  });

  els.queueCount.textContent = String(queueJobs.size);
  els.queueEmpty.hidden = queueJobs.size > 0;
}

function buildQueueItemEl(job, idx) {
  const root = els.queueItemTemplate.content.firstElementChild.cloneNode(true);
  const glyph = root.querySelector('[data-role="glyph"]');
  const filename = root.querySelector('[data-role="filename"]');
  const badge = root.querySelector('[data-role="badge"]');
  const actionBtn = root.querySelector('[data-role="action-btn"]');
  const summaryEl = root.querySelector('[data-role="summary"]');
  const summaryLine1 = root.querySelector('[data-role="summary-line1"]');
  const summaryLine2 = root.querySelector('[data-role="summary-line2"]');
  const meterRow = root.querySelector('[data-role="meter-row"]');
  const meter = root.querySelector('[data-role="meter"]');
  const meterReadout = root.querySelector('[data-role="meter-readout"]');

  filename.textContent = job.filename;
  root.dataset.jobId = job.job_id;

  if (job.summary) {
    renderQueueSummary(summaryEl, summaryLine1, summaryLine2, job.summary);
  }

  if (job.state === "active") {
    root.classList.add("active");
    glyph.textContent = "▶";
    badge.textContent = "encoding";
    actionBtn.textContent = "Stop";
    actionBtn.classList.add("danger");
    actionBtn.addEventListener("click", () => stopActiveJob(job.job_id));

    meterRow.hidden = false;
    for (let i = 0; i < METER_SEGMENTS; i++) {
      const seg = document.createElement("div");
      seg.className = "meter-seg";
      meter.appendChild(seg);
    }
    updateMeterEl(meter, meterReadout, job);

    if (job.summary?.timelapse) {
      const notice = document.createElement("div");
      notice.className = "tl-notice info";
      notice.style.cssText = "margin-top:8px; font-family:var(--font-ui); font-size:11.5px;";
      notice.textContent = "It's normal for timelapse encodes to show no progress. It's also heavily CPU reliant. Just be patient!";
      root.appendChild(notice);
    }
  } else {
    glyph.textContent = "⏸";
    badge.textContent = `queued · #${idx + 1}`;
    actionBtn.textContent = "✕";
    actionBtn.title = "Remove from queue";
    actionBtn.addEventListener("click", () => removeQueuedJob(job.job_id));
  }

  return root;
}

function updateQueueItemProgress(job) {
  const root = els.queueList.querySelector(`[data-job-id="${job.job_id}"]`);
  if (!root) return;
  const meter = root.querySelector('[data-role="meter"]');
  const meterReadout = root.querySelector('[data-role="meter-readout"]');
  if (meter && meterReadout) updateMeterEl(meter, meterReadout, job);
}

function updateMeterEl(meterEl, readoutEl, job) {
  const pct = Math.max(0, Math.min(100, job.percent || 0));
  const litCount = Math.round((pct / 100) * METER_SEGMENTS);
  const segs = meterEl.children;
  for (let i = 0; i < segs.length; i++) {
    segs[i].classList.toggle("lit", i < litCount);
  }
  const elapsedStr = formatSeconds(job.elapsed);
  const remainingStr = job.remaining != null ? formatSeconds(job.remaining) : "--:--";
  const pctSpan = document.createElement("span");
  pctSpan.className = "pct";
  pctSpan.textContent = `${pct.toFixed(0)}%`;
  readoutEl.replaceChildren(pctSpan, document.createTextNode(`\u00a0\u00a0elapsed ${elapsedStr} · left ${remainingStr}`));
}

function formatSeconds(value) {
  if (value == null || isNaN(value)) return "--:--";
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ==================================================================================
   Toasts
   ================================================================================== */

const LONG_ERROR_THRESHOLD = 120; // chars before we offer expand/collapse

function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.className = "toast" + (type === "success" ? " success" : "");

  if (type === "error" && message.length > LONG_ERROR_THRESHOLD) {
    // Collapsible error: show first few lines by default, big arrow to expand
    const body = document.createElement("div");
    body.className = "toast-body";
    body.textContent = message;
    toast.appendChild(body);

    const expandBtn = document.createElement("button");
    expandBtn.className = "toast-expand-btn";
    expandBtn.type = "button";
    expandBtn.textContent = "▼";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // don't dismiss the toast when clicking expand
      const isExpanded = body.classList.toggle("expanded");
      expandBtn.textContent = isExpanded ? "▲" : "▼";
    });
    toast.appendChild(expandBtn);
  } else {
    toast.textContent = message;
  }

  toast.addEventListener("click", () => toast.remove());
  els.toastContainer.appendChild(toast);
}

function showCompletedToast(filename, inputSize, outputSize) {
  const toast = document.createElement("div");
  toast.className = "toast success";

  const msg = document.createElement("div");
  msg.textContent = `Finished: ${filename}`;
  toast.appendChild(msg);

  if (inputSize != null && outputSize != null) {
    const row = document.createElement("div");
    row.className = "toast-size-row";

    const before = document.createElement("span");
    before.className = "toast-size-before";
    before.textContent = humanFileSize(inputSize);

    const arrow = document.createElement("span");
    arrow.className = "toast-size-arrow";
    arrow.textContent = "→";

    const after = document.createElement("span");
    const smaller = outputSize <= inputSize;
    after.className = "toast-size-after " + (smaller ? "smaller" : "larger");
    const pct = ((outputSize / inputSize) * 100).toFixed(1);
    after.textContent = `${humanFileSize(outputSize)} (${pct}%)`;

    row.appendChild(before);
    row.appendChild(arrow);
    row.appendChild(after);
    toast.appendChild(row);
  }

  toast.addEventListener("click", () => toast.remove());
  els.toastContainer.appendChild(toast);
}

function humanFileSize(bytes) {
  if (bytes == null || isNaN(bytes)) return "?";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  for (const unit of units) {
    bytes /= 1024;
    if (bytes < 1024) return `${bytes.toFixed(1)} ${unit}`;
  }
  return `${bytes.toFixed(1)} PB`;
}


/* ==================================================================================
   Reconnect on demand
   ================================================================================== */

els.statusLabel.addEventListener("click", () => {
  if (!port) connectNative();
});
els.statusLed.addEventListener("click", () => {
  if (!port) connectNative();
});

/* ==================================================================================
   Keyboard shortcuts (opt-in, targets the top pending card only)
   ================================================================================== */

els.shortcutsEnabled.addEventListener("change", () => {
  els.shortcutsTable.hidden = !els.shortcutsEnabled.checked;
});

const FPS_NUMBER_KEYS = { "1": 5, "2": 10, "3": 15, "4": 20, "5": 25, "6": 30 };

// Advances a <select> to the next non-disabled option, wrapping around.
function cycleSelect(selectEl) {
  const opts = Array.from(selectEl.options).filter(o => !o.disabled);
  if (opts.length < 2) return;
  const curIdx = opts.findIndex(o => o.value === selectEl.value);
  const next = opts[(curIdx + 1) % opts.length];
  selectEl.value = next.value;
  selectEl.dispatchEvent(new Event("change"));
}

// Briefly highlights the matching sk-row(s) for a key or set of keys
function flashKey(...keys) {
  for (const key of keys) {
    const row = document.querySelector(`.sk-row[data-key="${key}"]`);
    if (!row) continue;
    row.classList.add("active");
    setTimeout(() => row.classList.remove("active"), 300);
  }
}

// Returns the field object for the first pending card, or null if there are none.
function getTopCardFields() {
  const first = pendingFiles.values().next().value;
  return first ? first.f : null;
}

document.addEventListener("keydown", (e) => {
  if (!els.shortcutsEnabled.checked) return;
  // Don't fire when the user is typing into an input/select/textarea
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;

  const key = e.key.toLowerCase();
  const f = getTopCardFields();
  if (!f) return;

  switch (key) {
    case "k":
      cycleSelect(f.container);
      flashKey("k");
      break;
    case "v":
      if (!f.vcodecField.hidden) { cycleSelect(f.vcodec); flashKey("v"); }
      break;
    case "a":
      if (!f.acodecField.hidden) { cycleSelect(f.acodec); flashKey("a"); }
      break;
    case "e":
      if (!f.encoderField.hidden) { cycleSelect(f.encoder); flashKey("e"); updateFieldVisibility(pendingFiles.values().next().value); }
      break;
    case "q":
      if (!f.qualityField.hidden) { cycleSelect(f.quality); flashKey("q"); }
      break;
    case "r":
      if (!f.resolutionField.hidden) {
        const entry = pendingFiles.values().next().value;
        cycleSelect(f.resolutionPreset);
        applyResolutionPreset(entry, f.resolutionPreset.value);
        flashKey("r");
      }
      break;
    case "f":
      if (!f.fpsRow.hidden) {
        f.fpsEnabled.checked = !f.fpsEnabled.checked;
        f.fpsEnabled.dispatchEvent(new Event("change"));
        flashKey("f");
      }
      break;
    case "d":
      if (!f.gpuDecodeRow.hidden) {
        f.gpuDecodeEnabled.checked = !f.gpuDecodeEnabled.checked;
        flashKey("d");
      }
      break;
    case "m":
      f.keepMetadata.checked = !f.keepMetadata.checked;
      flashKey("m");
      break;
    case "c":
      f.keepChapters.checked = !f.keepChapters.checked;
      flashKey("c");
      break;
    case "y":
      f.addBtn.click();
      flashKey("y");
      break;
    default:
      // Number keys 1-6: set FPS to preset value if FPS is enabled
      if (FPS_NUMBER_KEYS[key] !== undefined && !f.fpsRow.hidden && f.fpsEnabled.checked) {
        f.fpsValue.value = FPS_NUMBER_KEYS[key];
        clampFpsField(pendingFiles.values().next().value);
        flashKey("1"); // all number keys share the same sk-row (data-key="1")
      }
  }
});

/* ==================================================================================
   Boot
   ================================================================================== */

connectNative();
