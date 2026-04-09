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
  //console.log("New update page loaded")
/*   const doisendupdatenews = localStorage.getItem("updateOptedIn");
  const updatenewstoggle = document.getElementById("updatenewstoggle"); */
  const settingsButton = document.getElementById("settingsButton");

  status.textContent = "JS Status: Javascript loaded fine";
  
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
  
  settingsButton.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
});