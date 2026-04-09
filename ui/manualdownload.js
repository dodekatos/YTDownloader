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
  const urlInput = document.getElementById("manualUrl");
  const popupFrame = document.getElementById("popupFrame");
  const errorMsg = document.getElementById("errorMsg");
  
  let debounceTimer = null;
  
  // Simple but solid URL validator
  function isValidUrl(str) {
    try {
      const u = new URL(str);
      // Only accept http/https URLs (no javascript:, file:, etc.)
      return /^https?:$/.test(u.protocol);
    } catch {
      return false;
    }
  }
  
  // Debounced handler for input
  urlInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const url = urlInput.value.trim();
      
      if (url === "") {
        popupFrame.style.display = "none";
        errorMsg.style.display = "none";
        return;
      }
      
      if (!isValidUrl(url)) {
        popupFrame.style.display = "none";
        errorMsg.textContent = "Please enter a valid URL (starting with http:// or https://)";
        errorMsg.style.display = "block";
        return;
      }
      
      errorMsg.style.display = "none";
      const popupUrl = browser.runtime.getURL("popup.html") + "?manual=true&url=" + encodeURIComponent(url);
      popupFrame.src = popupUrl;
      popupFrame.style.display = "block";
    }, 500); // 0.5 s debounce
  });
});