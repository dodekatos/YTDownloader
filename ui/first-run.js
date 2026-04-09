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
  
  const checkNC = document.getElementById('check-nc');
  const NCresult = document.getElementById('nc-result');
  const downloadNC = document.getElementById('download-nc');
  
  function removeCooldown3() {
    cooldown2 = false;
    checkNC.classList.remove("cooldown");
    const oldSpinner = checkNC.querySelector(".spinner");
    if (oldSpinner) checkNC.removeChild(oldSpinner);
  }
  function removeCooldown4() {
    cooldown2 = false;
    downloadNC.classList.remove("cooldown");
    const oldSpinner = downloadNC.querySelector(".spinner");
    if (oldSpinner) downloadNC.removeChild(oldSpinner);
  }
  
  let cooldown2 = false;
  
  checkNC.addEventListener('click', () => {
	// Button cooldown
	if (cooldown2) return;
	cooldown2 = true;
	checkNC.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	checkNC.appendChild(spinner);
	
	// Check if Native Client exists, if no response is received then it's assumed it does not exist
	browser.runtime.sendNativeMessage('ytdlp_host', {
	  action: 'ping',
	  }, (response) => {
		browser.runtime.sendNativeMessage('nc_updater', {
		  action: 'ping',
		  }, (response2) => {
			if (!response || !response.success) {
			  NCresult.textContent = 'Native Client is not installed';
			  downloadNC.style.display = 'block'; // was inline-block
			  removeCooldown3();
			} else if (!response2 || !response2.success) {
			  NCresult.textContent = 'Native Client Updater is not installed';
			  downloadNC.style.display = 'block'; // was inline-block
			  removeCooldown3();
			} else if (response && response.success && response2 && response2.success) {
			  NCresult.textContent = 'Native Client is installed! You can proceed.';
			  downloadNC.style.display = 'none';
			  removeCooldown3();
			} else {
			  NCresult.textContent = 'Native Client is not installed';
			  downloadNC.style.display = 'inline-block';
			  removeCooldown3();
			};
		  });
	  });
  });
  
  downloadNC.addEventListener('click', () => {
	// Button cooldown
	if (cooldown2) return;
	cooldown2 = true;
	downloadNC.classList.add("cooldown");
	const spinner = document.createElement("span");
	spinner.classList.add("spinner");
	downloadNC.appendChild(spinner);
	
	// Initiate download for Native Client from Github
	window.open("https://github.com/dodekatos/YTDownloader/raw/refs/heads/main/native-client-setup.exe", "_blank");
	
	// Cooldown reset after 4 seconds
	setTimeout(() => {
      removeCooldown4();
	  NCresult.innerHTML = `<ol><li>The Native Client setup <i>should</i> now be downloaded - Run it and follow the instructions provided.</li>
	  <li>If it did not download, refresh the page and click the download button again.</li>
	  <li>You might see a Windows SmartScreen popup, that is to be expected because I'm not paying some signing authority just for this, just click <i><strong>More info</strong></i> and then <i><strong>Run anyway</strong></i>.</li>
	  <li>It might take a good minute or two, so just be patient.</li>
	  <li>After you have completed the installation, click the "Check if Native Client is installed" button again.</li></ol>`;
	}, 4000);
  });
  
  document.getElementById('open-settings').addEventListener('click', () => {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL('options.html'));
    }
  });
});