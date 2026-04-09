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

document.addEventListener("DOMContentLoaded", () => {
  
  const result = document.getElementById("result");
  const pickBtn = document.getElementById("pickBtn");
  
  const fileSummary = document.getElementById("fileSummary");
  const ffselected = document.getElementById("ffselected");
  const ffcontainer = document.getElementById("ffcontainer");
  const ffwidth = document.getElementById("ffwidth");
  const ffheight = document.getElementById("ffheight");
  const fffps = document.getElementById("fffps");
  const ffvcodec = document.getElementById("ffvcodec");
  const ffvbitrate = document.getElementById("ffvbitrate");
  const ffacodec = document.getElementById("ffacodec");
  const ffduration = document.getElementById("ffduration");
  const ffduration2 = document.getElementById("ffduration2");
  const ffbitrate = document.getElementById("ffbitrate");
  const ffsize = document.getElementById("ffsize");
  const ffthreads = document.getElementById("ffthreads");
  const ffeta = document.getElementById("ffeta");
  const ffetaUpper = document.getElementById("ffetaUpper");
  const ffetaMid = document.getElementById("ffetaMid");
  const ffetaMidFormatted = document.getElementById("ffetaMidFormatted");
  const ffetanotice = document.getElementById("ffetanotice");
  const bettereta = document.getElementById("bettereta");
  const ffbettereta = document.getElementById("ffbettereta");
  
  const options = document.getElementById("options");
  const containerSel = document.getElementById("containerSel"); // "container"
  const videoRow = document.getElementById("videoRow"); // "videosection"
  const audioRow = document.getElementById("audioRow"); // "audiosection"
  const vcodec = document.getElementById("videoSel");
  const acodec = document.getElementById("audioSel");
  const warning = document.getElementById("warning");
  const warning2 = document.getElementById("warning2");
  const warning3 = document.getElementById("warning3");
  const startBtn = document.getElementById("startBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const cancelInfo = document.getElementById("cancelInfo");
  
  containerSel.value = ".mkv";
  vcodec.value = "libsvtav1";
  acodec.value = "copy";
  
  const encContainer = document.getElementById("encodeTimerContainer");
  const encTimer = document.getElementById("encodeTimer");
  const encNotice = document.getElementById("encodeNotice");
  let encodeTimerInterval = null;
  let encodeStartTime = null;
  let encodeExpectedUpper = null;
  
  const attachMetadata = document.getElementById("optMetadata");
  const attachChapters = document.getElementById("optChapters");
  const attachMetadataStatus = document.getElementById("optMetadata").checked;
  const attachChaptersStatus = document.getElementById("optChapters").checked;
  
  const qualitySelectorContainer = document.getElementById("qualitySelectorContainer");
  const qualityOptions = document.querySelectorAll(".quality-option");
  const qualityDesc = document.getElementById("qualityDesc");
  
  const hwQualitySelectorContainer = document.getElementById("hwQualitySelectorContainer");
  const hwQualityOptions = document.querySelectorAll(".hwquality-option");
  const hwQualityDesc = document.getElementById("hwQualityDesc");
  
  const changeFpsCheckbox = document.getElementById("changeFpsCheckbox");
  const fpsInput = document.getElementById("fpsInput");
  const fpsError = document.getElementById("fpsError");
  const fpsInfo = document.getElementById("fpsInfo");
  const fpsContainer = document.getElementById("fpsContainer");
  
  let currentProbe = null;
  
  function removeCooldown(btn) {
    btn.cooldown = false;
	btn.classList.remove("cooldown");
    const oldSpinner = btn.querySelector(".spinner");
    if (oldSpinner) btn.removeChild(oldSpinner);
  }
  
  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  
  function startEncodeTimer(upperEstimateSeconds = null) {
    encodeStartTime = Date.now();
    encodeExpectedUpper = upperEstimateSeconds;
    encContainer.style.display = "block";
    encNotice.textContent = "";
    
    encodeTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - encodeStartTime) / 1000);
      encTimer.textContent = formatDuration(elapsed);
      
      /* if (
        encodeExpectedUpper &&
        elapsed > encodeExpectedUpper * 1.25 &&
        encNotice.textContent === ""
      ) {
        encNotice.textContent = "Looks like it's taking longer than expected. The ETA could just be innacurate though.";
      } */
	  // ^^ Might remove this at some point, redundant since adding the live ETA
    }, 1000);
  }
  
  function stopEncodeTimer(success = true) {
    if (!encodeStartTime) return;
    clearInterval(encodeTimerInterval);
    const elapsed = Math.floor((Date.now() - encodeStartTime) / 1000);
    encNotice.textContent = "";
    encTimer.textContent = `That took: ${formatDuration(elapsed)}`;
  }
  
  function resetEncodeTimer() {
    clearInterval(encodeTimerInterval);
    encodeStartTime = null;
    encodeExpectedUpper = null;
    encContainer.style.display = "none";
    encTimer.textContent = "";
    encNotice.textContent = "";
  }
  
  
  const qualityDescriptions = {
    low: "Smaller file size, slightly lower visual quality. Great for archival or low complexity source video",
    default: "Recommended for best balance of quality and size",
    high: "Small file size savings, similar visual quality to original video. I'd recommend Default instead",
  };
  
  const hwQualityDescriptions = {
    cpu: "Takes much longer than GPU to encode. Only recommended if you don't have a GPU. Technically visually more 'accurate' than GPU encoding.",
    nvidia: "Significantly faster than CPU encoding. Recommended if you have an Nvidia GPU.",
    intel: "Notice: Untested. Might not work, and ETA is likely very inaccurate.",
	amd: "Notice: Untested. Might not work, and ETA is likely very inaccurate. Make sure you have the latest GPU drivers, and have at least a semi-modern AMD GPU.",
  };
  
  // Example function to show/hide based on codec
  function handleCodecChange(selectedCodec) {
    if (selectedCodec === "libx265" || selectedCodec === "libsvtav1" || selectedCodec === "libx264") {
      qualitySelectorContainer.style.display = "flex";
      hwQualitySelectorContainer.style.display = "flex";
    } else {
      qualitySelectorContainer.style.display = "none";
      hwQualitySelectorContainer.style.display = "none";
    }
  }
  
  function validateFpsInput() {
    const value = fpsInput.value.trim();
    let errorMsg = "";
	let errorMsg2 = "";
    let isValid = true;
    
    if (changeFpsCheckbox.checked) {
	  console.log("hey it got here")
      if (value === "") {
		// User has input nothing
		console.log("Please enter a value.")
        errorMsg = "Please enter a value.";
        isValid = false;
      } else if (!/^\d+(\.\d{1,3})?$/.test(value)) {
		// User has failed to use decimal places or points properly
		console.log("Only numbers with up to 3 decimal places are allowed.")
        errorMsg = "Only numbers with up to 3 decimal places are allowed.";
        isValid = false;
      } else {
		// User has failed to choose a number between 1-1000 inclusive
        const num = parseFloat(value);
        if (num < 1 || num > 1000) {
          console.log("FPS must be between 1 and 1000.")
          errorMsg = "FPS must be between 1 and 1000.";
          isValid = false;
        }
      }
	  /* console.log(`Input FPS is: ${value} and it parsefloated is ${parseFloat(value)}`)
	  console.log(`FFFPS is: ${fffps.textContent} and it parsefloated is ${parseFloat(fffps.textContent)}`) */
	  if (parseFloat(value) > parseFloat(fffps.textContent)) {
		console.log("yeah nah too big mate")
		fpsInfo.textContent = "FPS is higher than the input file's FPS of: " + fffps.textContent + " - Setting the output FPS higher than your input FPS will just waste storage."
	    fpsInfo.style.display = "block";
	  } else {
		console.log("file size looks good mate")
		fpsInfo.style.display = "none";
	  }
    }
    
    if (!isValid) {
	  console.log("not valid")
      fpsError.textContent = errorMsg;
      fpsError.style.display = "block";
      startBtn.style.display = "none";
    } else {
	  console.log("looks valid to me")
      fpsError.style.display = "none";
      startBtn.style.display = "block";
    }
    
    return isValid;
  }
  
  // Show/hide FPS input
  changeFpsCheckbox.addEventListener("change", () => {
    fpsInput.style.display = changeFpsCheckbox.checked ? "inline-block" : "none";
    fpsError.style.display = "none";
	fpsInfo.style.display = "none";
    fpsInput.value = "";
    validateFpsInput();
  });
  
  // Validate on every keystroke
  fpsInput.addEventListener("input", validateFpsInput);
  
  // Helper to get final FPS value
  function getSelectedFps() {
    if (!changeFpsCheckbox.checked) return null;
    return parseFloat(fpsInput.value.trim());
  }
  
  
  function setOptions(selectEl, validOptions) {
    // Remember current values
    const current = selectEl.value;
	const prettyNames = {
	  // Containers
      mkv: ".MKV",
      mp4: ".MP4",
      m4a: ".M4A - Audio only",
      mp3: ".MP3 - Audio only",
	  amv: ".AMV",
      
      // Video
      copy: "Copy from source",
      libsvtav1: "AV1",
      libx265: "H.265",
      libx264: "H.264",
      none: "No video",
	  amv_v: "AMV Video",
      
      // Audio
      "copy-audio": "Copy from source", // Funky alias for audio "copy"
      aac: "AAC",
      libmp3lame: "MP3",
      "none-audio": "No audio",
	  amv_a: "AMV Audio"
	};
	
    selectEl.innerHTML = ""; // Clears all the a/v codec buttons' text
	
    validOptions.forEach(opt => {
      const option = document.createElement("option");
	  
	  // Fixes its weird audio tomfoolery
	  if (opt === "copy-audio") {
		option.value = "copy";
	  } else if (opt === "none-audio") {
		option.value = "none";
	  } else {
		option.value = opt;
	  }
	  
      option.textContent = prettyNames[opt];
      selectEl.appendChild(option);
    });
    // restore previous choice if still valid
    if (validOptions.includes(current)) {
      selectEl.value = current;
    }
  }
  
  function validateChoices() {
	const cont = containerSel.value
    const v = vcodec.value;
    const a = acodec.value;
	const videoscodec = ffvcodec.textContent;
	const audioscodec = ffacodec.textContent;
	startBtn.style.display = "block";
	fpsContainer.style.display = "none"; // display was block, hidden while the fps feature is not ready yet
	// i think the issue i had was it not working when copying the video, so maybe only have it appear when vcodec is set to h26x/av1?
	warning.style.display = "none";
	warning2.style.display = "none";
	warning3.style.display = "none";
	ffetanotice.style.display = "none";
    
	if (videoscodec === "none" && (v === "libx265" || v === "libx264" || v === "libsvtav1" || v === "copy")) {
	  warning.textContent = "Warning: Input file has no video. Consider using an 'Audio only' Container instead.";
      warning.style.display = "block";
	  warning.style.color = "#ffa700";
      startBtn.style.display = "none";
    } else if (videoscodec === "none") {
	  fpsContainer.style.display = "none";
	  changeFpsCheckbox.checked = false;
    } else if (v === "copy" && a === "copy") {
      warning.textContent = "Warning: Copying both streams will just remux - no re-encode will happen. This can be a waste of time, unless if you're intentionally remuxing.";
      warning.style.display = "block";
	  warning.style.color = "#ffa700";
    } else if (v === "none" && a === "none") {
      warning.textContent = "Warning: Disabling both audio and video will cause the re-encode to fail. I have removed the Start button. You shall not pass.";
      warning.style.display = "block";
	  warning.style.color = "#ffa700";
      startBtn.style.display = "none";
    } else if (cont === ".mp4" && (v === "libx265")) {
	  warning.textContent = "Notice: .MKV is recommended for H265 videos, as .MP4 player support for H265 can be inconsistent.";
	  warning.style.display = "block";
	  warning.style.color = "#bb9856";
    } else if (cont === ".mkv" && (v === "libsvtav1")) {
	  warning.textContent = "Notice: If the output video doesn't have a thumbnail, try opening it in the Photos app. That should make Windows generate a thumbnail for it.";
	  warning.style.display = "block";
	  warning.style.color = "#bb9856";
	} else if ((cont === ".mkv" || cont === ".mp4") && (v === "none")) {
	  warning.textContent = `Notice: Hey champ, are you intentionally setting 'No video' with a ${cont} container? You could consider using an 'Audio only' container instead.`;
	  warning.style.display = "block";
	  warning.style.color = "#bb9856";
    } else {
      warning.style.display = "none";
    }
	if (videoscodec === "av1" && v === "libsvtav1") {
	  warning2.textContent = "Warning: Input video is already AV1. Consider using 'Copy' video instead.";
      warning2.style.display = "block";
	  warning2.style.color = "#ffa700";
      startBtn.style.display = "none";
	} else if (videoscodec === "hevc" && v === "libx265") {
	  warning2.textContent = "Warning: Input video is already H.265. Consider using 'Copy' video instead.";
      warning2.style.display = "block";
	  warning2.style.color = "#ffa700";
      startBtn.style.display = "none";
	} else if (videoscodec === "h264" && v === "libx264") {
	  warning2.textContent = "Warning: Input video is already H.264. Consider using 'Copy' video instead.";
      warning2.style.display = "block";
	  warning2.style.color = "#ffa700";
      startBtn.style.display = "none";
	} else if (videoscodec != "none" && (cont === ".m4a" || cont === ".mp3")) {
	  fpsContainer.style.display = "none";
	  changeFpsCheckbox.checked = false;
    } else {
      warning2.style.display = "none";
	}
	if (audioscodec === "aac" && a === "aac") {
	  if (cont === ".m4a" && videoscodec != "none") {
		warning3.style.display = "none";
	  } else {
	    warning3.textContent = "Warning: Input audio is already AAC.";
	    warning3.textContent += (cont === ".mkv" || cont === ".mp4") ? " Consider using 'Copy' audio instead." : "";
        warning3.style.display = "block";
	    warning3.style.color = "#ffa700";
        startBtn.style.display = "none";
	  }
	} else if (audioscodec === "mp3" && a === "libmp3lame") {
	  if (cont === ".mp3" && videoscodec != "none") {
		warning3.style.display = "none";
	  } else {
	    warning3.textContent = "Warning: Input audio is already MP3.";
	    warning3.textContent += (cont === ".mkv" || cont === ".mp4") ? " Consider using 'Copy' audio instead." : "";
        warning3.style.display = "block";
	    warning3.style.color = "#ffa700";
        startBtn.style.display = "none";
	  }
	} else if (audioscodec === "none" && (a === "aac" || a === "libmp3lame" || a === "copy")) {
	  warning2.textContent = "Warning: Input file has no audio. Consider setting the Audio codec to 'none' instead.";
      warning2.style.display = "block";
	  warning2.style.color = "#ffa700";
    } else {
      warning3.style.display = "none";
	}
	
	handleCodecChange(v);
	
	let hwChoice = document.querySelector(".hwquality-option.selected")?.dataset.quality || "cpu"; // Should be "cpu" / "nvidia" / "intel" / "amd"
	console.log("got here")
	console.log("[TempInfo] hwChoice: " + hwChoice)
	console.log("[TempInfo] ffetaMid: " + Math.round(ffetaMid.textContent)) // culprit line
	console.log("got here two")
	if ((Math.round(ffetaMid.textContent) > 600) && (hwChoice === "cpu") && (v === "libx264" || v === "libx265" || v === "libsvtav1")) {
      ffetanotice.style.display = "block";
	} else {
	  ffetanotice.style.display = "none";
	}
  }
  
  function updateUI() {
	const rules = {
      ".mp3": {
        videoAllowed: false,
		video: ["none"],
        audio: ["libmp3lame"]
      },
      ".m4a": {
        videoAllowed: false,
		video: ["none"],
        audio: ["aac"]
      },
      ".mp4": {
        videoAllowed: true,
        video: ["copy", "libsvtav1", "libx265", "libx264", "none"],
        audio: ["copy-audio", "aac", "libmp3lame", "none-audio"]
      },
      ".mkv": {
        videoAllowed: true,
        video: ["copy", "libsvtav1", "libx265", "libx264", "none"],
        audio: ["copy-audio", "aac", "libmp3lame", "none-audio"]
      },
	  ".amv": {
		videoAllowed: true,
		video: ["amv_v"],
		audio: ["amv_a"]
	  },
	  ".wmv": {
		videoAllowed: true,
		video: ["wmv_v"],
		audio: ["wmv_a"]
	  }
    };
	
    const choice = containerSel.value;
    const rule = rules[choice];
    
    // Show/hide video section
    if (!rule.videoAllowed) {
      videoRow.style.display = "none";
    } else {
      videoRow.style.display = "block";
    }
    
    // Update video + audio options
    setOptions(vcodec, rule.video);
    setOptions(acodec, rule.audio);
    
    validateChoices();
  }
  
  // When a user clicks one of the quality options
  qualityOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      qualityOptions.forEach(o => o.classList.remove("selected", "qlow", "qmed", "qhigh"));
      opt.classList.add("selected");
      const q = opt.dataset.quality;
	  if (q === "low") opt.classList.add("qlow");
	  if (q === "default") opt.classList.add("qmed");
	  if (q === "high") opt.classList.add("qhigh");
      qualityDesc.textContent = qualityDescriptions[q];
	  
	  console.log("Selected Quality: " + q)
	  estimateEncodeTime();
    });
  });
  
  // When a user clicks one of the hardware choice options
  hwQualityOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      hwQualityOptions.forEach(o => o.classList.remove("selected", "hwcpu", "hwnvidia", "hwintel", "hwamd"));
      opt.classList.add("selected");
      const q = opt.dataset.quality;
	  if (q === "cpu") opt.classList.add("hwcpu");
	  if (q === "nvidia") opt.classList.add("hwnvidia");
	  if (q === "intel") opt.classList.add("hwintel");
	  if (q === "amd") opt.classList.add("hwamd");
      hwQualityDesc.textContent = hwQualityDescriptions[q];
	  
	  console.log("Selected HW: " + q)
	  estimateEncodeTime(); // future note: important to have ETA estimate before validate choices
	  validateChoices();
	  console.log("HEY i got here wtf")
    });
  });
  
  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
      h > 0 ? h + "h" : null,
      m > 0 ? m + "m" : null,
      s > 0 ? s + "s" : null
    ].filter(Boolean).join(" ");
  }
  
  function formatFileSize(rawsize) {
	if (rawsize === 0 || isNaN(rawsize)) return "0 MB";
	const mb = rawsize / (1024 * 1024);
	if (mb < 1024) {
	  return mb.toFixed(1) + " MB";
	}
	
	const gb = mb / 1024;
	return gb.toFixed(1) + " GB";
  }
  
  function estimateEncodeTime() {
    const duration = Number(ffduration.textContent); // in seconds
    const width = Number(ffwidth.textContent); // e.g. 1920
    const height = Number(ffheight.textContent); // e.g. 1080
    const fps = Number(fffps.textContent); // e.g. 30
	const fvCodec = vcodec.value; // Video codec we're converting to, e.g. libsvtav1
	const faCodec = acodec.value; // Audio codec we're converting to, e.g. aac
	const threads = Number(ffthreads.textContent); // Number of CPU threads we'll use if the user chose CPU encoding
	
    const inputVideoBitrate = ffvbitrate.textContent; // Input video's bitrate
	const inputAudioBitrate = ffbitrate.textContent; // Input audio's bitrate
	const hw = document.querySelector(".hwquality-option.selected")?.dataset.quality || "cpu"; // Should be "cpu" / "nvidia" / "intel" / "amd"
	console.log("[TempInfo] hw: " + hw)
	
    /* // baseline reference
    const baselinePixels = 1920 * 1080 * 30;
    const pixelsPerSec = width * height * fps;
    const resFactor = pixelsPerSec / baselinePixels;
	console.log("pixelspersec: " + pixelsPerSec)
	console.log("resFactor: " + resFactor)
    
    // codec factors (baseline at 1080p30, 1 thread)
    const videoFactors = {
      "copy": { factor: 0.04, eff: 1.0 },
      "none": { factor: 0, eff: 1.0 },
      "libx265": { factor: 1, eff: 0.9 },
      "libx264": { factor: 1, eff: 0.9 },
      "libsvtav1": { factor: 2.0, eff: 0.6 },
	  "amv_v": { factor: 0.1, eff: 0.9 }, // Placeholder value
    };
    
    let videoTime = 0;
    if (videoFactors[fvCodec]) {
      const { factor, eff } = videoFactors[fvCodec];
      videoTime = duration * factor * resFactor / Math.pow(threads, eff);
	  console.log("duration: " + duration + " - factor: " + factor + " - resFactor: " + resFactor + " - mathpow: " + threads + eff)
    }
	console.log("fvCodec: " + fvCodec)
    console.log("videoTime: " + videoTime) */
	    
	
	// Baseline encoding speeds (fps @ 1080p)
	// NOTE: THESE VALUES ARE NOT DIRECTLY COMPARABLE TO FFMPEG'S FPS
    const baseline = {
        nvidia: { libx264: 370, libx265: 345, libsvtav1: 325 }, // was 500, 260, 120 // better values are 370, 345, 325
        intel:  { libx264: 315, libx265: 300, libsvtav1: 285  }, // random guesses based on nvidia but slightly worse
        amd:    { libx264: 300, libx265: 290, libsvtav1: 275  }, // random guesses based on nvidia but slightly worse
        cpu:    { libx264: 7,  libx265: 6,   libsvtav1: 13   } // somewhat random guesses atm. not directly comparable with gpu numbers
    };
	
	// Thread scaling exponents for CPU
    const threadExponent = {
        libx264: 0.90,
        libx265: 0.75,
        libsvtav1:  0.6
    };

    const base_fps = baseline[hw]?.[fvCodec];
    /* if (!base_fps) {
        ffeta.textContent = "You shouldn't be seeing this error.";
        return;
    } */
	console.log("[important for debugging video audio idk] base_fps is: " + base_fps)
	
	function ifvideo() {
	  // Resolution scaling
      const basePixels = 1920 * 1080;
      const inputPixels = Math.max(1, width * height);
      const resScale = basePixels / inputPixels;
	  
      // Complexity scaling (using video bitrate)
      const referenceBitrate = 8_000_000; // 8 Mbps
      const bitrate = Math.max((inputVideoBitrate * 1024 * 1024), 200_000); // safety floor 200kbps
	  console.log("[TempInfo] Video's bitrate in MB/s: " + inputVideoBitrate)
	  console.log("[TempInfo] Thus the bps bitrate we use is: " + bitrate)
      const complexityScale = Math.sqrt(referenceBitrate / bitrate);
	  
      // Final encoding speed estimate
      const encode_fps = base_fps * resScale * complexityScale;
	  console.log("resScale: " + resScale)
	  console.log("complexityScale: " + complexityScale)
	  console.log("pre scaled fps: " + encode_fps)
	  // Apply CPU thread scaling ONLY if CPU encoding
      function ifcpu() {
        const exp = threadExponent[fvCodec] || 0.85;
		const mathed = (Math.round(encode_fps) > 1) ? Math.round(encode_fps) : 1;
        const encode_fps2 = mathed * Math.pow(threads, exp);
		return encode_fps2;
      }
	  const encode_fps2 = (hw === "cpu") ? ifcpu() : encode_fps;
	  console.log("post scaled fps: " + encode_fps2)
	  
	  console.log("duration in seconds: " + duration)
	  /* const subtotal = duration / encode_fps2; */
	  const speed_factor = encode_fps2 / Math.max(1, fps);
	  const subtotal = duration / Math.max(1e-9, speed_factor);
	  console.log("subtotal: " + subtotal)
	  return subtotal;
	}
	
	const subtotal = (base_fps) ? ifvideo() : 0;
	
	
	const audioFactors = {
      "copy": 0.01,
      "none": 0.01,
      "aac": 0.03,
      "libmp3lame": 0.03,
	  "amv_a": 0.03, // Placeholder value, but likely not significant
    };
	let audioTime = 0;
    if (audioFactors[faCodec] !== undefined) {
      audioTime = duration * audioFactors[faCodec];
    }
    
	const total = subtotal + audioTime + 1; // added 1 to account for time to open ffmpeg and prepare for re-encode. useful for small files
	
    ffeta.textContent = (formatTime(total * 0.8)) + " ~ " + (formatTime(total * 1.2))
	ffetaUpper.textContent = (total * 1.2)
	ffetaMid.textContent = total
	ffetaMidFormatted.textContent = formatTime(total)
  }
    
  // Opens file explorer dialogue
  pickBtn.addEventListener("click", () => {
	// Button cooldown stuff, so you don't accidentally click it multiple times
	if (pickBtn.cooldown) return;
	pickBtn.cooldown = true;
	pickBtn.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	pickBtn.appendChild(spinner);
    
	resetEncodeTimer();
	
	result.textContent = "Opening file picker… (This can take a few seconds)";
	
    browser.runtime.sendNativeMessage("ytdlp_host", { action: "reencode_pick_file" })
      .then(resp => {
        if (!resp || !resp.success) {
          result.textContent = "No file selected / Error: " + (resp?.error || "unknown");
		  removeCooldown(pickBtn);
          return;
        }
        currentProbe = resp;
        const hasV = !!resp.has_video;
        const hasA = !!resp.has_audio;
		
		if (resp.video_fps) {
		  let [num1, num2] = (resp.video_fps).split("/").map(Number);
		  real_video_fps = num1 / num2
		}
        // Shows the user in a debug-ish way about the input file's info
        fileSummary.classList.remove("hidden");
        ffselected.textContent = resp.path;
		ffcontainer.textContent = resp.container || "unknown";
		ffwidth.textContent = hasV ? (resp.video_width || "unknown") : "0";
		ffheight.textContent = hasV ? (resp.video_height || "unknown") : "0";
		fffps.textContent = hasV ? (real_video_fps.toFixed(1) || "unknown") : "0";
		ffvcodec.textContent = hasV ? (resp.video_codec || "unknown") : "none";
		ffvbitrate.textContent = hasV ? ((resp.vbitrate_kbps / 1024 / 1024).toFixed(1) || "unknown") : "none";
		ffacodec.textContent = hasA ? (resp.audio_codec || "none") : "none";
		ffbitrate.textContent = resp.final_bitrate_kbps || "unknown";
		ffduration.textContent = resp.duration ? `${parseFloat(resp.duration).toFixed(1)}` : "unknown";
		// ^^ visually hidden to user - used internally for re-encode estimate calculation
		ffduration2.textContent = resp.duration ? (formatTime(resp.duration) || "unknown") : "unknown";
		ffsize.textContent = formatFileSize(resp.file_size) || "unknown";
		ffthreads.textContent = resp.cpu_threads || "unknown";
		ffoutputlocation.textContent = resp.output_location || "unknown";
        
		estimateEncodeTime();
		
        // Configure options visibility based on streams
        options.classList.remove("hidden");
        videoRow.style.display = hasV ? "block" : "none";
        audioRow.style.display = hasA ? "block" : "none";
        
        // If audio-only input, default container to m4a/mp3
        if (!hasV && hasA) {
          containerSel.value = ".mp3";
		  vcodec.value = "none";
          updateUI();
		  //vcodec.value = "none";
        } else {
		  containerSel.value = ".mkv";
		  vcodec.value = "libsvtav1";
		  acodec.value = "copy";
		  updateUI();
		}
		//if resp.video_codec in ("av1", "h265") {
		  //
		//}
		
        result.textContent = "Ready to re-encode.";
		
		// Various validation and cleanup things
		validateChoices();
		attachMetadata.checked = true;
		attachChapters.checked = true;
		changeFpsCheckbox.checked = false;
		fpsInput.style.display = "none";
		fpsError.style.display = "none";
		fpsInfo.style.display = "none";
		bettereta.style.display = "none";
	    cancelBtn.style.display = "none";
		//validateFpsInput();
		//if (changeFpsCheckbox.checked) { fpsInput.style.display = "block"; setTimeout(() => { validateFpsInput(); }, 200); }
		
		removeCooldown(pickBtn);
      })
      .catch(err => {
		removeCooldown(pickBtn);
	    result.textContent = ("Error: " + err.message + " - Is the Native Client installed?");
      });
  });
  
  containerSel.addEventListener("change", updateUI);
  containerSel.addEventListener("change", estimateEncodeTime);
  vcodec.addEventListener("change", estimateEncodeTime);
  acodec.addEventListener("change", estimateEncodeTime);
  vcodec.addEventListener("change", validateChoices);
  acodec.addEventListener("change", validateChoices);
  
  startBtn.addEventListener("click", () => {
	// Button cooldown stuff, so you don't accidentally click it multiple times
	if (startBtn.cooldown) return;
	startBtn.cooldown = true;
	startBtn.classList.toggle("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	startBtn.appendChild(spinner);
	
	//setTimeout(() => {removeCooldown(startBtn)}, 2000);
	//return
    
	if (!currentProbe || !currentProbe.path) {
      result.textContent = "Pick a file first.";
      return;
    }
	
	startEncodeTimer(ffetaUpper.textContent);
	
    const out_container = containerSel.value;
    const v_choice = videoRow.style.display === "none" ? "none" : vcodec.value;
    const a_choice = audioRow.style.display === "none" ? "none" : acodec.value;
    const final_bitrate_kbps = currentProbe.final_bitrate_kbps;
	const v_width = ffwidth.style.display === "none" ? "none" : ffwidth.value;
	const v_height = ffheight.style.display === "none" ? "none" : ffheight.value;
	const v_fps = fffps.style.display === "none" ? "none" : fffps.value;
	
    console.log(`Attach Metadata: ${attachMetadataStatus} | Attach Chapters: ${attachChaptersStatus}`)
	
	const crf = document.querySelector(".quality-option.selected")?.dataset.quality || "default"; // Should be "low" / "default" / "high"
	console.log("[TempInfo] Selected CRF word to be used: " + crf)
	
	const hwChoice = document.querySelector(".hwquality-option.selected")?.dataset.quality || "cpu"; // Should be "cpu" / "nvidia" / "intel" / "amd"
	console.log("[TempInfo] Selected hardware to be used: " + hwChoice)
	
	//if hwChoice in ("nvidia", "intel", "amd") { ## wait nvm don't use this but temp keep this just in case if === cpu doesn't work!
	/* if (hwChoice === "cpu") {
	  const useGpuStatus = "False"
	} else {
	  const useGpuStatus = "True"
	} */
	
    const useGpuStatus = hwChoice === "cpu" ? "False" : "True";
	console.log("Using GPU? " + useGpuStatus)
	
    result.textContent = "Re-encoding now… You can refresh or close this page to cancel the encode.";
    
    // If the user chose an audio-only container, force sensible choices
    if (out_container === ".m4a" || out_container === ".mp3") {
      // audio-only container -> strip video
      // (UI allows user to choose 'none' for video, but enforce here too)
      if (v_choice !== "none") {
        result.textContent = "For audio-only containers, video must be 'none'. Adjusting automatically.";
      } // ---- this'll get removed when i properly fix its current dumb child-proofing
    }
    
	
	const port = browser.runtime.connectNative("ytdlp_host");
    /* browser.runtime.sendNativeMessage("ytdlp_host", { */
	port.postMessage({
      action: "reencode_start",
      input_path: currentProbe.path,
      out_container,
      v_choice: (out_container === ".m4a" || out_container === ".mp3") ? "none" : v_choice,
      a_choice,
	  final_bitrate_kbps: currentProbe.final_bitrate_kbps,
	  attach_metadata: attachMetadataStatus,
	  attach_chapters: attachChaptersStatus,
	  crf: crf,
	  fps: getSelectedFps(),
	  use_gpu: useGpuStatus,
	  gpu_type: hwChoice,
	  v_width,
	  v_height,
	  v_fps,
	  duration: ffduration.textContent
    })
	// Deprecated below, handled further below
    /* .then(resp => {
      if (resp && resp.success) {
        let msg = `✅ Done!\nSaved to: ${resp.output}`;
        result.textContent = msg;
		removeCooldown(startBtn);
		stopEncodeTimer();
      } else {
        result.textContent = "❌ Failed: " + (resp?.error || "Unknown error");
		removeCooldown(startBtn);
		stopEncodeTimer();
      }
    })
    .catch(err => {
	  result.textContent = "❌ Error: " + err.message
	  removeCooldown(startBtn);
	  stopEncodeTimer();
	}); */
	
	// TODO - Fix the cancel button, idk why it's not able to send more than one message to a port. Each button by itself works.
	/* setTimeout(() => {
	  cancelBtn.style.display = "block";
	}, 1000) */
    cancelBtn.addEventListener("click", () => {
	  console.log("[TempInfo] User has requested to stop re-encode mid-way through")
      // Add cooldown to cancelBtn
	  if (cancelBtn.cooldown) return;
	  cancelBtn.cooldown = true;
	  cancelBtn.classList.add("cooldown");
	  const spinner = document.createElement("span");
	  spinner.classList.add("spinner");
	  cancelBtn.appendChild(spinner);
	  
	  console.log("[TempInfo] Sending message now!")
	  port.postMessage({
		action: "reencode_stop"
	  })
	  //port.disconnect();
	  //cancelInfo.style.display = "block";
	  setTimeout(() => {
		//removeCooldown(startBtn);
		//stopEncodeTimer();
		//bettereta.style.display = "none";
	    //cancelBtn.style.display = "none";
		removeCooldown(cancelBtn);
		//console.log("bypass worked i guess")
	  }, 10000);
	  // ^ Remove cooldown from cancel button after 10 seconds as a fallback that'll probably never be used
    });
	
	port.onMessage.addListener(resp => {
	  console.log("I received a message!")
	  bettereta.style.display = "block";
	  if (resp.event === "progress") {
		ffbettereta.textContent = resp.data.percent + "% (" + resp.data.encoded + "/" + Math.round(ffduration.textContent) + ")";
	  }
	  if (resp && resp.success) {
        const msg = `✅ Done!\nSaved to: ${resp.output}`;
        result.textContent = msg;
		// Then we cleanup
		removeCooldown(startBtn);
		stopEncodeTimer();
	    bettereta.style.display = "none";
	    cancelBtn.style.display = "none";
	    port.disconnect();
      }
	  if (!resp || resp.success === false) {
        result.textContent = "❌ Failed: " + (resp?.error || "Unknown error");
		// Then we cleanup
		removeCooldown(startBtn);
		stopEncodeTimer();
		bettereta.style.display = "none";
	    cancelBtn.style.display = "none";
	    port.disconnect();
      }
	  if (resp.event === "stopping") {
		console.log("[TempInfo] FFmpeg is confirmed to have at least received the request to stop re-encoding now")
		cancelInfo.style.display = "block";
		
		// Then we cleanup after a small 2 second delay so ffmpeg can finish up
		setTimeout(() => {
		  removeCooldown(startBtn);
		  stopEncodeTimer();
		  bettereta.style.display = "none";
	      cancelBtn.style.display = "none";
	      port.disconnect();
		  removeCooldown(cancelBtn);
		  console.log("[TempInfo] Successfully cleaned up after 2 second delay")
	    }, 2000)
	  }
	})
  });
});