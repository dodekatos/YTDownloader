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

// Runs the first-run page when the addon is first installed.
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({
      url: browser.runtime.getURL("first-run.html")
    });
  }
});

// Runs the new update page that has patch notes for each version (if I remember).
/* const doisendupdatenews = localStorage.getItem("updateOptedIn");
if (doisendupdatenews === "true") {
  browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "update") {
	  browser.tabs.create({
	    url: browser.runtime.getURL("newupdate.html")
	  });
    }
  });
} */
browser.storage.local.get("updateOptedIn").then((result) => {
  const doisendupdatenews = result.updateOptedIn;
  
  if (doisendupdatenews === "true") {
    // Only listen for updates if the user is opted in
    browser.runtime.onInstalled.addListener(details => {
      if (details.reason === "update") {
        browser.tabs.create({
          url: browser.runtime.getURL("newupdate.html")
        });
      }
    });
  }
}).catch((error) => {
  console.log("[BackgroundError] Error with showing update notes: ", error);
});


function showWebNotification(title, body) {
  if (Notification.permission === "granted") {
    new self.Notification(title, {
      body: body,
      icon: "icons/icon-48.png"
    });
  }
}

// Code for automatic dependency updates
function isTimeToRunUpdate() {
  return new Promise(resolve => {
    browser.storage.local.get("lastUpdateCheck", (result) => {
      const lastCheck = result.lastUpdateCheck;
      if (!lastCheck) {
        resolve(true); // First run, do it
        return;
      }
	  const logOldDate = new Date(lastCheck).toISOString().slice(0, 16).replace('T', '_');
      console.log(`[AutoUpdate Info] Last update check was: ${logOldDate}`)
      const now = Date.now();
	  const logNewDate = new Date(now).toISOString().slice(0, 16).replace('T', '_');
	  console.log(`[AutoUpdate Info] Now is: ${logNewDate}`)
      resolve((now - lastCheck) >= 604800000); // 7 days in milliseconds is 604800000
    });
  });
}

async function updateDependency(dep) {
  try {
    const whichhost = (dep === "native") ? "nc_updater" : "ytdlp_host";
	const whichaction = (dep === "native") ? "update_native_client": "updateDependency";
    
    const res = await browser.runtime.sendNativeMessage(whichhost, { action: whichaction, dep });
    
    return res && res.success;
  } catch (err) {
    console.log(`[AutoUpdate Error] Failed to update ${dep}:`, err);
    return false;
  }
}

async function runUpdateIfNeeded() {
  if (await isTimeToRunUpdate()) {
    console.log("[AutoUpdate Info] Running automatic dependency update...");

    const dependencies = ["nc_updater", "native", "ffmpeg", "ytdlp", "deno"];
    for (const dep of dependencies) {
	  console.log(`[AutoUpdate TempInfo] Checking update status for ${dep}`)
      try {
        const res = await browser.runtime.sendNativeMessage("ytdlp_host", { action: "checkUpdates", dep });
		if (!res) {
          console.log(`[AutoUpdate Error] Failed to check updates for ${dep}: `, res.message);
          continue;
        }
		
		if (res.update_available) {
          console.log(`[AutoUpdate Info] ${dep} needs updating`);

		  const whichhost = (dep === "native") ? "nc_updater" : "ytdlp_host";
		  const whichaction = (dep === "native") ? "update_native_client": "updateDependency";
		  
		  const res = await browser.runtime.sendNativeMessage(whichhost, { action: whichaction, dep });
		
          if (res && res.success) {
            console.log(`[AutoUpdate Info] ${dep} updated successfully`);
          } else {
            console.log(`[AutoUpdate Error] Failed to update ${dep}: `, res.message);
            showWebNotification("YTDownloader Error", `✖ Failed to automatically update ${dep} - You should manually update ${dep} via the Settings`);
          }
        } else {
            console.log(`[AutoUpdate Info] ${dep} is already up to date`);
        }
      } catch (err) {
          console.log(`[AutoUpdate Fatal Error] Failed to update ${dep}: `, err);
          showWebNotification("YTDownloader Error", `✖ Failed to automatically update ${dep} - You should manually update ${dep} via the Settings`);
        }
    }
		// We've reached the end of updates to check/do, so set Now as the last time updates were checked for.
        browser.storage.local.set({ lastUpdateCheck: Date.now() });
    } else {
        console.log("[AutoUpdate Info] Not yet time for weekly dependency check.");
    }
}
// This *should* only run once, 3 seconds after Firefox starts up to allow a small bit of time for CPU resources to be less contended

browser.storage.local.get("autoUpdateOptedOut").then((result) => {
  const optedout = result.autoUpdateOptedOut;
  if (optedout === "true") {
	console.log("[AutoUpdate Info] User is not opted in to automatically check for dependency updates")
  } else {
	console.log("[AutoUpdate Info] User is opted in to automatic dependency updates (OR the opt out value has not been set yet - The addon's default behaviour is to automatically check for updates)")
    console.log("[AutoUpdate Info] Waiting 3 seconds before checking if we should check for updates")
    setTimeout (() => runUpdateIfNeeded(), 3000);
  }
});

// Below is unused, it would've checked for dependency updates after the addon is updated, but I'm just going to assume that
// people will restart Firefox occasionally. Having this enabled might cause more issues than not because Firefox might update the
// addon when Firefox starts, potentially causing two update checks to happen almost at the exact same time.

/* browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    runUpdateIfNeeded();
  }
}); */



// Receives a select few commands like running downloads so they continue if the user clicks out of the popup download panel
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // I'm pretty sure this sendToNative isn't used, but I'm afraid to remove it.
  if (message.type === "sendToNative") {
	console.log("[BGInfo] sendToNative called.");
    const port = browser.runtime.connectNative("ytdlp_host");
    port.onMessage.addListener((response) => {
      sendResponse(response);
    });
    port.onDisconnect.addListener(() => {
      if (browser.runtime.lastError) {
        sendResponse({ status: "error", message: browser.runtime.lastError.message });
      }
    });
    port.postMessage(message.payload);
    return true;
  }
  
  if (message.action === "startDownload") {
	console.log("[BGInfo] startDownload called.");
	
    browser.runtime.sendNativeMessage("ytdlp_host", {
      action: "download",
      url: message.url,
      format: message.format
    }).then(response => {
      console.log("[BGInfo] Download response:", response);
	  try {
	    if (response.status === "success") {
	      showWebNotification("YTDownloader", "✔ Download complete!");
	    } else {
		  showWebNotification("YTDownloader", "✖ Download failed: " + response.message);
	    }
	  } catch (error) {
		console.error("Error sending Windows notification:", error);
	  };
	  
	  sendResponse({
		status: response.status,
		message: response.message,
		reencode_notice: response.reencode_notice,
		recovery_notice: response.recovery_notice
	  });
    }).catch(error => {
      console.error("Error sending native message:", error);
	  sendResponse({ status: "error", message: error.message });
    });
	return true;
  }
  
  if (message.action === "get_file_sizes") {
	console.log("[BGInfo] get_file_sizes called.");
	
    browser.runtime.sendNativeMessage("ytdlp_host", {
      action: "get_file_sizes",
      url: message.url
    }, (response) => {
	  //console.log("[BGInfo] File sizes: " + response)
	  //console.log("[BGInfo2] File sizes2: " + response.message)
	  //console.log("[BGInfo2] File sizes3: " + response.m4a)
      sendResponse(response);
    });
    return true; // Indicates async response
  }
  
  if (message.action === "testautoupdate") {
	console.log("[BGInfo] Testing auto updater");
	runUpdateIfNeeded();
  }
});
