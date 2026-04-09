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

document.addEventListener("DOMContentLoaded", async () => {
  const pathInput = document.getElementById("downloadPath");
  const status = document.getElementById("status");
  const dlocstatus = document.getElementById("dlocstatus");
  const dlenstatus = document.getElementById("dlenstatus");
  const currentPathDisplay = document.getElementById("currentPath");
/*   const doisendupdatenews = localStorage.getItem("updateOptedIn");
  const updatenewstoggle = document.getElementById("updatenewstoggle"); */
  const notificationsMessage = document.getElementById("notifications-message");
  const browsebtn = document.getElementById("browseBtn");
  const manifestVersion = document.getElementById("manifestVersion");

  status.textContent = "";
  
  try {
	const manVer = (browser.runtime.getManifest()).version;
    manifestVersion.textContent = "v" + manVer;
	console.log("Addon version: " + manVer)
  } catch (error) {
	console.error("Failed to fetch local version: ", error)
  }
  
/*   if (doisendupdatenews === "true") {
	updatenewstoggle.checked = true;
	console.log("User is subscribed to news updates")
  } else {
	updatenewstoggle.checked = false
	console.log("User is not subscribed to news updates")
  }
  updatenewstoggle.addEventListener("change", () => {
	localStorage.setItem("updateOptedIn", updatenewstoggle.checked ? "true" : "false");
	console.log("Subscription status: " + localStorage.getItem("updateOptedIn"))
  }); */
  
  browser.storage.local.get("updateOptedIn").then((result) => {
    const doisendupdatenews = result.updateOptedIn;
    const updatenewstoggle = document.getElementById("updatenewstoggle");
    
    if (doisendupdatenews === "true") {
      updatenewstoggle.checked = true;
      console.log("User is subscribed to news updates");
    } else {
      updatenewstoggle.checked = false;
      console.log("User is not subscribed to news updates");
    }
  
    // Add event listener for the toggle
    updatenewstoggle.addEventListener("change", () => {
      const isChecked = updatenewstoggle.checked;
      browser.storage.local.set({ updateOptedIn: isChecked ? "true" : "false" })
        .then(() => {
          console.log("Subscription status: " + (isChecked ? "true" : "false"));
        });
    });
  });
  
  browser.storage.local.get("autoUpdateOptedOut").then((result) => {
    const isAutoUpdateOptedOut = result.autoUpdateOptedOut;
    const autoupdatetoggle = document.getElementById("autoupdatetoggle");
    
    if (isAutoUpdateOptedOut === "true") {
      autoupdatetoggle.checked = false;
      console.log("Will not auto update weekly");
    } else {
      autoupdatetoggle.checked = true;
      console.log("Will auto update weekly");
    }
  
    // Add event listener for the toggle
    autoupdatetoggle.addEventListener("change", () => {
      const isChecked = autoupdatetoggle.checked;
      browser.storage.local.set({ autoUpdateOptedOut: isChecked ? "false" : "true" })
        .then(() => {
          console.log("Auto update opted out status: " + (isChecked ? "Will auto update" : "Won't auto update"));
        });
    });
  });
  
  function removeCooldown(btn) {
    //cooldown = false;
    btn.cooldown = false;
	btn.classList.remove("cooldown");
    const oldSpinner = btn.querySelector(".spinner");
    if (oldSpinner) btn.removeChild(oldSpinner);
  }
  
  // Load current config from stub
  browser.runtime.sendNativeMessage("ytdlp_host", {
    action: "get_config"
  }).then(response => {
    if (response.status === "success" && response.config && response.config.download_dir) {
	  if (response.recovery_notice) {
    	currentPathDisplay.textContent = response.config.download_dir + " ---- Recovery notice: " + response.recovery_notice;
		}
	  else {
		currentPathDisplay.textContent = response.config.download_dir;
	  }
    } else {
      currentPathDisplay.textContent = "Unavailable: " + response.message;
    }
  }).catch(err => {
    currentPathDisplay.textContent = "Error loading config";
  });

  document.getElementById("saveBtn").addEventListener("click", () => {
    const dir = pathInput.value.trim();
    dlocstatus.textContent = "Changing download path..";
	
	if (!dir) {
      dlocstatus.textContent = "Please enter a valid path.";
      return;
    }
    
    browser.runtime.sendNativeMessage("ytdlp_host", {
      action: "update_config",
      config: { download_dir: dir }
    }).then(response => {
      if (response.status === "success") {
        dlocstatus.textContent = "Saved to config!";
        currentPathDisplay.textContent = dir;
		// ^ I know I should probably make it return the path with double backslashes, but I don't care enough to 'fix' this.
		// Single forward slashes look better to end-users anyways.
      } else {
        dlocstatus.textContent = "Failed: " + response.message;
      }
    }).catch(err => {
      dlocstatus.textContent = "Error: " + err.message;
    });
  });
  
  browsebtn.addEventListener("click", async () => {
	// Button cooldown
	/* if (cooldown2) return;
	cooldown2 = true; */
	// moving to smart button cooldowns, above can be removed once finished
	if (browsebtn.cooldown) return;
	browsebtn.cooldown = true;
	browseBtn.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	browseBtn.appendChild(spinner);
	
    try {
      const response = await browser.runtime.sendNativeMessage("ytdlp_host", { action: "pickDownloadFolder"});
      if (response && response.path) {
        document.getElementById("downloadPath").value = response.path;
		removeCooldown(browseBtn);
      } else {
		removeCooldown(browseBtn);
	  }
    } catch (err) {
      console.error("[Error] Folder picker failed:", err);
	  dlocstatus.textContent = "Failed to choose folder";
	  removeCooldown(browseBtn);
    }
  })
  
  // Start of Dependency check table
  // Step 1: Immediately checks the version of locally installed dependencies
  // It's also the main handler for all the buttons, pointing to the different defs

  // Reusable init function (no DOMContentLoaded here)
  async function initDependencyTable() {
    console.log("Loaded dependency check table");
    const deps = ["ffmpeg", "ytdlp", "deno", "native", "nc_updater"];
    /* for (const dep of deps) {
      await checkLocalVersion(dep);
    } */
	await Promise.all(deps.map(checkLocalVersion));
	// Awesome, this change now runs all local dependency version checks at the same time, bigger cpu spike but like 10x speed improvement
    
	const nicename = {
	  "ffmpeg": "FFmpeg",
	  "ytdlp": "YT-DLP",
	  "deno": "Deno",
	  "native": "Native Client",
	  "nc_updater": "Native Client Updater"
	};
	
    document.querySelectorAll(".dep-btn").forEach(btn => {
      // make sure we don't add duplicates if initDependencyTable gets called again
      btn.removeEventListener("__dep_click__", btn.__depHandler); // harmless if undefined
      const handler = async () => {
        const dep = btn.dataset.dep;
        const action = btn.textContent.trim();
        
        if (action === "Download") {
          await updateDependency(dep, btn, nicename[dep]);
        } else if (action === "Check for updates") {
          await checkForUpdates(dep, btn, nicename[dep]);
        } else if (action === "Update to latest") {
          await updateDependency(dep, btn, nicename[dep]);
        }
      };
      // store so we can remove later if needed
      btn.__depHandler = handler;
      btn.addEventListener("click", handler);
    });
  }
  //await initDependencyTable();
  initDependencyTable();
  // Looks like removing await lets me now click the built-in tools buttons, but not the deps' check for updates buttons
  
  // Todo of low importance: re-figure out how this works and make it not do one at a time because that's really slow
  
//  it rewrote it slightly so idk if i should keep this orrrr
//  because it still works as far as i can tell
//  
//  document.addEventListener("DOMContentLoaded", async () => {
//	console.log("loaded new dep check table")
//    const deps = ["ffmpeg", "ytdlp", "native"];
//    for (const dep of deps) {
//      await checkLocalVersion(dep);
//    }
//  
//    document.querySelectorAll(".dep-btn").forEach(btn => {
//      btn.addEventListener("click", async () => {
//        const dep = btn.dataset.dep;
//        const action = btn.textContent.trim();
//  
//        if (action === "Download") {
//          await downloadDependency(dep, btn);
//        } else if (action === "Check for updates") {
//          await checkForUpdates(dep, btn);
//        } else if (action === "Update to latest") {
//          await updateDependency(dep, btn);
//        }
//      });
//    });
//  });
  
  // Function for checking the version of locally installed dependencies
  // Any that are unable to be checked are considered as missing
  async function checkLocalVersion(dep) {
    const row = document.getElementById(`dep-${dep}`);
    const currentCell = row.querySelector(".current-version");
    const btn = row.querySelector(".dep-btn");
    
    currentCell.textContent = "Checking...";
    const res = await browser.runtime.sendNativeMessage("ytdlp_host", { action: "getLocalVersion", dep: dep });
    
    if (!res || !res.local || !res.success) {
      currentCell.textContent = "Not installed";
      btn.textContent = "Download";
	  btn.style.backgroundColor = 'green';
    } else {
      currentCell.textContent = res.local;
      btn.textContent = "Check for updates";
	  btn.style.backgroundColor = '#0078d7';
    }
  }
  
  // Step 2: Checks Github for the latest version of each dependency, and compares it against the local versions
  async function checkForUpdates(dep, btn, nicename) {
    const row = document.getElementById(`dep-${dep}`);
    const latestCell = row.querySelector(".latest-version");
	const latestCellInner = latestCell.querySelector('a');
    const statusCell = row.querySelector(".status-text");
    const currentVersion = row.querySelector(".current-version").textContent;
	
	// Button cooldown
	/* if (cooldown) return;
	cooldown = true; */
	if (btn.cooldown) return;
	btn.cooldown = true;
	btn.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	btn.appendChild(spinner);
    
    statusCell.textContent = "Checking for updates...";
    const res = await browser.runtime.sendNativeMessage("ytdlp_host", { action: "checkUpdates", dep: dep });
    
    if (!res || res.success == false) {
      statusCell.textContent = `Failed to check for updates. ${res.message}`;
	  removeCooldown(btn);
      return;
    }
	
    if (latestCellInner) {
		latestCellInner.textContent = res.latest || "Unknown";
	} else {
		latestCell.textContent = res.latest || "Unknown";
	}
    
    if (res.update_available) {
      btn.textContent = "Update to latest";
	  btn.style.backgroundColor = 'green';
      statusCell.textContent = `${nicename} update available!`;
	  removeCooldown(btn);
    } else {
      btn.textContent = "Check for updates";
	  btn.style.backgroundColor = '#0078d7';
      statusCell.textContent = `${nicename} is already up to date!`;
	  removeCooldown(btn);
    }
  }
  
  // Step 3: Downloads any missing dependencies, and updates any that have a new version available.
  async function updateDependency(dep, btn, nicename) {
    const row = document.getElementById(`dep-${dep}`);
    const statusCell = row.querySelector(".status-text");
	
	const whichhost = (dep === "native") ? "nc_updater" : "ytdlp_host";
	const whichaction = (dep === "native") ? "update_native_client": "updateDependency";
	const rightdepthistime = (dep === "native") ? "nc_updater" : "native";
	console.log("whichhost: " + whichhost)
    console.log("whichaction: " + whichaction)
	console.log("dep is: " + dep)
	console.log("btn is: " + btn)
	
	// Button cooldown
	/* if (cooldown) return;
	cooldown = true; */
	if (btn.cooldown) return;
	btn.cooldown = true;
	btn.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	btn.appendChild(spinner);
	
    statusCell.textContent = "Updating...";
	
	const res = await browser.runtime.sendNativeMessage(whichhost, { action: whichaction, dep: dep });
	
    if (res && res.success) {
      statusCell.textContent = `${nicename} updated successfully!`;
	  btn.style.backgroundColor = '#0078d7';
	  await checkLocalVersion(dep);
      btn.textContent = "Check for updates";
	  btn.style.backgroundColor = '#0078d7';
	  removeCooldown(btn);
    } else {
      statusCell.textContent = `Failed to update ${nicename}.`;
	  removeCooldown(btn);
    }
  }
  // End of dependency check table
  
  document.getElementById("enable-notifications").addEventListener("click", () => {
    if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
		  notificationsMessage.style.display = 'none';
          new Notification("Notifications enabled!", { body: "You'll now get download status updates even if the popup is closed." });
        } else if (perm === "denied") {
		  notificationsMessage.textContent = "Notifications permissions denied!";
		  notificationsMessage.style.display = 'inline-block';
		}
      });
    }
  });
  
  document.getElementById('open-reencode').addEventListener('click', () => {
    if (browser.runtime.openOptionsPage) {
      window.open(browser.runtime.getURL('reencode.html'));
    }
  });
  
  document.getElementById('open-manualdownload').addEventListener('click', () => {
    if (browser.runtime.openOptionsPage) {
      window.open(browser.runtime.getURL('manualdownload.html'));
    }
  });
  
  document.getElementById('open-updatenews').addEventListener('click', () => {
    if (browser.runtime.openOptionsPage) {
      window.open(browser.runtime.getURL('newupdate.html'));
    }
  });
  
  document.getElementById('open-firstrun').addEventListener('click', () => {
    if (browser.runtime.openOptionsPage) {
      window.open(browser.runtime.getURL('first-run.html'));
    }
  });
  
  pathInput.addEventListener("input", () => {
    if (pathInput.value.length > 150) {
      dlenstatus.style.display = "block";
    } else {
      dlenstatus.style.display = "none";
    }
  });
  
  defenderBtn.addEventListener("click", () => {
	/* if (cooldown) return;
	cooldown = true; */
	if (defenderBtn.cooldown) return;
	defenderBtn.cooldown = true;
	defenderBtn.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	defenderBtn.appendChild(spinner);
	
	browser.runtime.sendNativeMessage("ytdlp_host", {
      action: "open_defender",
    })
    .then(resp => {
      if (resp && resp.success) {
		removeCooldown(defenderBtn);
      } else {
        console.log("[Error] Failed to open Windows Defender")
		removeCooldown(defenderBtn);
      }
    })
    .catch(err => {
	  console.log("[Error] Failed to open Windows Defender")
	  removeCooldown(defenderBtn);
	});
  });
});
