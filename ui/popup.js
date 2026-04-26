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

console.log("[Popup] Start - popup.js loaded.");

function getYouTubePageType(urlString) { // TODO - Make this way neater
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.replace(/^www\./, ""); // Normalise hostname (remove "www.")
    const pathname = url.pathname;
	console.log("[PopupInfo] URL hostname: " + hostname)
	console.log("[PopupInfo] URL pathname: " + pathname)
	
	// If it's not YouTube, return that it's a generic website
	if (!["youtube.com", "youtu.be", "music.youtube.com"].includes(hostname)) {
	  console.log("[PopupInfo] It's a Generic website.")
      return "generic";
    }
	
	// Check if it's a YouTube playlist
    if ((hostname === "youtube.com" || hostname === "music.youtube.com") && pathname.startsWith("/playlist")) {
	  console.log("[PopupInfo] It's a YouTube Playlist.")
      return "playlist";
    }
	// Check if it's a YouTube channel's playlists
    if ((hostname === "youtube.com" || hostname === "music.youtube.com") && /^\/@[^\/]+\/playlists/.test(pathname)) {
	  console.log("[PopupInfo] It's a YouTube Channel's Playlists.")
      return "channelplaylists";
    }
	// Check if it's a YouTube channel
    if ((hostname === "youtube.com" || hostname === "music.youtube.com") && pathname.startsWith("/@")) {
	  console.log("[PopupInfo] It's a YouTube Channel.")
      return "channel";
    }
	
    // Check if it's a YouTube video/short/clip
    if (
      hostname === "youtube.com" && (
        pathname.startsWith("/watch") ||
        pathname.startsWith("/shorts") ||
        pathname.startsWith("/clip") || pathname.startsWith("/live")
      )
    ) {
	  console.log("[PopupInfo] It's a normal YouTube video.")
	  return "video";
	}
	
	if (hostname === "youtu.be") return "video";
	if (hostname === "music.youtube.com") return "video";
	
	console.log("[PopupInfo] Looks like it failed all those checks. Guess it's a Generic website.")
	return "generic";
  } catch (e) {
    console.log("[PopupError] Invalid URL: ", e);
    return "generic";
  }
}

function showWebNotification(title, body) {
  if (Notification.permission === "granted") {
    new self.Notification(title, {
      body: body,
      icon: "icons/icon-48.png"
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status");
  const notice0 = document.getElementById("notice0");
  const notice1 = document.getElementById("notice1");
  const notice2 = document.getElementById("notice2");
  const toggleBtn = document.getElementById("toggleMoreBtn");
  const moreOptions = document.getElementById("moreOptions");
  const youtubeOptions = document.getElementById("youtubeOptions");
  const extraYTDownloads = document.getElementById("extraYTDownloads");
  const dateCheckboxDiv = document.getElementById("dateCheckboxDiv");
  const playlistNotice = document.getElementById("playlistNotice");
  const channelPlaylistNotice = document.getElementById("channelPlaylistNotice");
  const channelNotice = document.getElementById("channelNotice");
  const genericOptions = document.getElementById("genericOptions");
  const toggleBtnz = document.getElementById("toggleMoreBtnz");
  const dateCheckbox = document.getElementById("dateCheckbox");
  
  
  const buttons = document.querySelectorAll(".download-button");
  
  const themeToggle = document.getElementById("theme-toggle");
  const settingsButton = document.getElementById("settings-button");
  const storedTheme = localStorage.getItem("theme");
  
  const estimateBtn = document.getElementById("estimateBtn");
  const sizers = document.getElementsByClassName("size");
  
  async function getCurrentUrl() {
	/* console.log("[Tempinfo] start of getCurrentUrl function") */
    const params = new URLSearchParams(window.location.search);
    const manualUrl = params.get("url");
    
    if (manualUrl) {
      console.log("[PopupInfo] Manual URL detected:", manualUrl);
      return manualUrl;
    } /* else {
      console.log("[TempInfo] Not a manual URL")
	} */
    
    try {
	  const tab = await browser.tabs.query({ active: true, currentWindow: true });
	  const tab2 = await tab[0].url;
	  console.log("[PopupInfo] Tab is: " + tab2);
	  return tab2;
    } catch (err) {
      console.log("[PopupError] Failed to get current tab URL: ", err);
      return "";
    }
  }
  
  status.textContent = "Ready";
  
  function removeCooldown() {
    cooldown = false;
    buttons.forEach(btn => {
      btn.classList.remove("cooldown");
      const oldSpinner = btn.querySelector(".spinner");
      if (oldSpinner) btn.removeChild(oldSpinner);
    });
  }
  function removeCooldown2() {
    cooldown2 = false;
    estimateBtn.classList.remove("cooldown");
    const oldSpinner = estimateBtn.querySelector(".spinnerlight");
    if (oldSpinner) estimateBtn.removeChild(oldSpinner);
  }
  
  function fixIfYtUrl(url) {
    // Check if it's a YouTube URL
    const ytPattern = /(?:youtu\.be|youtube\.com\/(?:watch\?|clip\/|shorts\/|playlist))/i;
    if (!ytPattern.test(url)) return url; // Not YouTube, skip cleaning
    
    try {
      const parsed = new URL(url);
	  // oops the below caused playlists to not work
      //parsed.searchParams.delete("list"); // Safely remove ?list=... or &list=...
	  // vv This should be ^^ but better
	  if (parsed.searchParams.size > 1) {
        parsed.searchParams.delete("list");
      }
	  
      parsed.searchParams.delete("index"); // Safely remove ?index=... or &index=...
      parsed.searchParams.delete("start_radio"); // Safely remove ?start_radio=... or &start_radio=...
      return parsed.toString();
    } catch {
      // Fallback for malformed URLs
      return url.replace(/[?&]list=[^&]+/g, "");
    }
  }
  
  // Load theme on startup
  if (storedTheme === "light") {
    document.body.classList.add("light-mode");
    themeToggle.textContent = "☀️";
  } else {
    document.body.classList.remove("light-mode");
    themeToggle.textContent = "🌙";
  }
  // Toggle theme
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    themeToggle.textContent = isLight ? "☀️" : "🌙";
  });
  
  // Settings button behavior
  settingsButton.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
  
  let cooldown2 = false;
  
  // Default all options to Hidden
  youtubeOptions.style.display = "none";
  playlistNotice.style.display = "none";
  channelPlaylistNotice.style.display = "none";
  channelNotice.style.display = "none";
  genericOptions.style.display = "none";
  estimateBtn.style.color = "#ffffff";
  estimateBtn.disabled = false;
  
  dateCheckbox.addEventListener("change", () => {
	if (document.getElementById('dateCheckbox').checked) {
	console.log("[PopupInfo] date ticked: " + dateCheckbox.checked)
	} else {
	  console.log("[PopupInfo] date unticked: " + dateCheckbox.checked);
	}
  });
  
  // Get current tab
  getCurrentUrl().then(currentUrl => {
	const pageType = getYouTubePageType(currentUrl);
	
	// Universal things to show
	toggleBtnz.style.display = "block";
	toggleBtn.style.display = "block";
	dateCheckboxDiv.style.display = "block";
	
	if (pageType === "video") { // Show YT-optimised options + Extra YT-only qualities
	  youtubeOptions.style.display = "block";
	  extraYTDownloads.style.display = "block";
	} else if (pageType === "playlist") { // Show YT-optimised options + Playlist text info
	  playlistNotice.style.display = "block";
	  estimateBtn.style.color = "#121212";
	  estimateBtn.disabled = true;
	  youtubeOptions.style.display = "block";
	  extraYTDownloads.style.display = "block";
    } else if (pageType === "channelplaylists") {
	  channelPlaylistNotice.style.display = "block";
	  estimateBtn.style.color = "#121212";
	  estimateBtn.disabled = true;
	  youtubeOptions.style.display = "block";
	  extraYTDownloads.style.display = "block";
    } else if (pageType === "channel") {
	  channelNotice.style.display = "block";
	  estimateBtn.style.color = "#121212";
	  estimateBtn.disabled = true;
	  youtubeOptions.style.display = "block";
	  extraYTDownloads.style.display = "block";
    } else {
	  genericOptions.style.display = "block"; // Show generic options
	}
	
    // Grab file size of each download option for the current url, if possible
	estimateBtn.addEventListener("click", () => {
	  if (["playlist", "channelplaylists", "channel"].includes(pageType)) {
		// This should not be possible to trigger because the estimate button should be hidden and unclickable when ^ criteria is met
		notice0.style.display = "block";
        notice0.textContent = "Can't estimate file size for this URL type."
	  } else {
		// Button cooldown
		if (cooldown2) return;
		cooldown2 = true;
		estimateBtn.classList.add("cooldown");
		const spinner = document.createElement("span");
		spinner.classList.add("spinnerlight");
		estimateBtn.appendChild(spinner);
		
		console.log("[PopupInfo] Got to video file size query")
		notice0.style.display = "block";
        notice0.textContent = "Fetching estimated file sizes.."
	    //const url = fixIfYtUrl(tabs[0].url);
		const url = fixIfYtUrl(currentUrl);
		/* console.log("[TempInfo] url: " + url) */
        browser.runtime.sendMessage({
          action: "get_file_sizes",
          url: url
        }, (response) => {
          if (!response || response.error || (typeof response === 'object' && Object.keys(response).length === 0 && response.constructor === Object)) {
			notice0.style.display = "block";
			notice0.textContent = "Unable to estimate file sizes. This can be normal for non-YouTube sites, but double check the URL anyways.";
            console.log("[PopupError] Error getting file sizes");
			removeCooldown2();
            return;
          }
          //console.log("[PopupInfo] Video file size response: " + response)
	      for (let i = 0; i < sizers.length; i++) {
			sizers[i].classList.add("showsize");
		  }
		  
          // Loop through all keys in the response and update corresponding elements
          Object.entries(response).forEach(([formatKey, size]) => {
            const sizeElement = document.getElementById(`size-${formatKey}`); // TODO IMPORTANT <=====================================================
            if (sizeElement && size) {
		      //console.log(formatKey + " - " + size) // If you want to log each file size for excessive debugging
              sizeElement.textContent = size;
            }
          });
		  console.log("[PopupInfo] Successfully found file sizes.")
		  notice0.style.display = "block";
		  notice0.textContent = "Successfully found file sizes."
		  removeCooldown2();
        });
      };
	});
  });
  
  // Toggle 'More Options'
  toggleBtn.addEventListener("click", () => {
    if (moreOptions.style.display === "none") {
      moreOptions.style.display = "block";
      toggleBtn.textContent = "Less Download Options ⯆";
    } else {
      moreOptions.style.display = "none";
      toggleBtn.textContent = "More Download Options ⯈";
    }
  });

  // Handle download format buttons
  let cooldown = false;
  
  buttons.forEach(button => {
    button.addEventListener("click", () => {
      // If you're on cooldown, click doesn't do anything
	  if (cooldown) return;
	  
	  const format = button.dataset.format;
      if (!format) return; // Skip if no format (extra protection)
	  
	  status.textContent = "Checking tab...";
	  
	  // Disable all buttons
	  cooldown = true;
	  buttons.forEach(btn => {
		btn.classList.add("cooldown");
	  });
	  
	  // Add spinner to clicked button
	  const spinner = document.createElement("span");
	  spinner.classList.add("spinner");
	  button.appendChild(spinner);
	  
	  // Get URL
	  getCurrentUrl().then(currentUrl => {
		const url = fixIfYtUrl(currentUrl);
		const datechecked = dateCheckbox.checked;
		console.log("[TempPopupInfo] datechecked is: " + datechecked)
		const pageType = getYouTubePageType(currentUrl);
		console.log("[TempPopupInfo] pageType is: " + pageType)
		status.textContent = "Downloading...";
		
		// Send download message
		browser.runtime.sendMessage({
		  action: "startDownload",
		  url: url,
		  format: format,
		  datechecked: datechecked,
		  pagetype: pageType
		}).then(response => {
		  if (response.status === "success") {
			status.textContent = "✔ Download complete!";
			removeCooldown();
			
			if (typeof response.recovery_notice === "string" && response.recovery_notice.trim() !== "") {
				notice1.style.display = "block";
				notice1.textContent = "Recovery notice: " + response.recovery_notice;
			}
			
			if (typeof response.reencode_notice === "string" && response.reencode_notice.trim() !== "") {
				notice2.style.display = "block";
				notice2.textContent = response.reencode_notice;
			}
		  } else {
			status.textContent = "✖ Failed: " + response.message;
			removeCooldown();
		  }
		}).catch(error => {
		  status.textContent = "✖ Error: " + error.message;
		  removeCooldown();
		});
      });
    });
  });  
});
