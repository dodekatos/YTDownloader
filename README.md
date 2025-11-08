# YTDownloader

A lightweight and privacy friendly browser extension (currently just Firefox) that utilises [YT-DLP](https://github.com/yt-dlp/yt-dlp) to download video and audio from websites via a simple popup.  
The popup interacts with a Native Client to run YT-DLP and serve other functions.

The extension includes a simple video and audio re-encoding tool that makes use of FFmpeg and FFprobe. All re-encoding happens locally on your PC, currently with just CPU acceleration.

The extension also includes a Settings page where you can easily update all dependencies (YT-DLP, FFmpeg, Native Client), read update notes, and do various other things.

## Installation
- (Recommended) The extension is available on the [Firefox Add-on Store](https://addons.mozilla.org/en-GB/firefox/addon/ytdownloader-dodekatos/) - Simply add it and follow the installation instructions.
  
- (Manual) You can alternatively add the extension by downloading the [Latest GitHub Release](https://github.com/dodekatos/YTDownloader/releases/latest) and manually installing the extension: Head to the Firefox Extensions Manager page, click the Gear icon, and click <b>Install Add-on</b> from File.

I'd recommend using the Firefox Add-on Store as it has automatic updates.  
  
I'll add more source code once I've figured out a good sustainable workflow for doing so for each release.

## Requirements
- Firefox 112.0 or newer (April 2023)
- Windows 10/11 64-bit only
- Administrator is not required, though will be if you add a Windows Defender exception for the Native Client

## Support
This is essentially just a personal project that I'm sharing among some friends.  
If you've otherwise stumbled upon this, you're welcome to create an [Issue](https://github.com/dodekatos/YTDownloader/issues) or [Pull Request](https://github.com/dodekatos/YTDownloader/pulls), describe your issue, and provide any relevant useful information. But again, as this is a personal project, I cannot guarantee any level of support, nor make any non-critical changes.

## Privacy
YTDownloader **does not** and **does not want to** collect or transmit any of your personal data. The closest it gets to that is:
- The **locally stored** log file at C:\ProgramData\YTDownloader\log.txt will contain file paths for your debugging purposes
- YT-DLP obviously accesses the internet to download video/audio, but it does not use/affect any of your browser's cookies for this purpose

## License
YTDownloader is licensed under the **GNU General Public License v3.0** (GPL-3.0), a CopyLeft and Open Source friendly license.
Other dependencies used may be under different licenses, as follows:

## Credits / Dependencies used
- [YT-DLP](https://github.com/yt-dlp/yt-dlp) (Main application for downloading video and audio - Be aware of fake or unofficial websites)
- [FFmpeg + FFprobe](https://ffmpeg.org/) | [(Exact source)](https://github.com/GyanD/codexffmpeg) (Used by YT-DLP and the re-encode tool)
- [Inno](https://jrsoftware.org/isinfo.php) (Used for the Native Client installer)
