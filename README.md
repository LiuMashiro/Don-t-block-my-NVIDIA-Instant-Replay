# Don't Touch My NVIDIA Instant Replay
**English** | [中文](README_CN.md)
### "Before disabling features belonging to the user's computer and discarding the user's content, user consent shall be obtained first."

A Tampermonkey script that prompts the user before a webpage loads the Widevine CDM (used for playing protected content), which would terminate NVIDIA Instant Replay. DRM playback and termination of NVIDIA Instant Replay will only proceed after user authorization. This prevents Instant Replay from being automatically shut down without consent (it will not reopen automatically), along with discarding recorded but unsaved content. Interception remains active until the user explicitly grants permission.

User options: When a site genuinely needs to play DRM content, the user may choose to save the existing Instant Replay recording first, and receive clearer notice that Instant Replay will subsequently be blocked — so the user can re-enable it after playback ends. For sites that abuse this mechanism even when no protected content exists, the user can deny permission (and the denial status will be remembered for that site).

**Warning**: This script is NOT intended to circumvent, bypass or crack DRM digital copyright protection mechanisms. It cannot unlock, decrypt, save or distribute any DRM-protected content, and **does NOT grant the browser the ability to record DRM-encrypted video content**. After the script intercepts EME calls, DRM-encrypted videos on the blocked site will be unplayable. To load the Widevine CDM, the user must manually grant authorization. Once authorized, Instant Replay will be blocked by the site following the original logic, allowing DRM content to play.

<img width="466" height="270" alt="image" src="https://github.com/user-attachments/assets/26ade8c4-22be-4d01-b487-3db48f6f26da" />

Tip: If you don’t need desktop recording, you can also disable it in the NVIDIA app.

## Features
- Intercept browser APIs related to EME / Widevine on target websites
- Two blocking modes: `reject` (directly throw NotSupportedError), `hang` (return a Promise that never resolves)
- Allow temporary whitelisting for the current session, or permanent addition to the allowlist
- A corner icon entry shown at the bottom-right of the webpage, or hotkey `Alt+E` to manually open the control panel
- Mainly targeting mainstream Chromium-based browsers

## Installation
1. Install a userscript manager: Tampermonkey
2. Import the script
3. Navigate to web pages. 

## Legal Disclaimer
```
This script is a pure front-end browser functional optimization tool intended for personal use only on the user's local device. It has no development intent to crack, bypass or tamper with copyright protection systems. The core function of the script is to intercept the loading and invocation of the Encrypted Media Extensions (EME) and Widevine CDM modules on web pages. Its primary purpose is to prevent NVIDIA ShadowPlay instant replay from being forcibly interrupted when the browser loads copyright protection modules, optimizing local screen recording experience. This constitutes an experience optimization action for the user's personal device.

This script represents custom configuration optimization for the user's personal browser client. It does not involve illegal technical acts such as server-side tampering, network data hijacking, or encryption protocol cracking. The script contains no code logic for decrypting, stealing, tampering with, copying or disseminating copyrighted audio and video content. It does not modify or bypass core website copyright verification mechanisms, nor does it break any payment access permissions or content access restrictions. It possesses no technical capability for infringement or violation.

After the script takes effect, it will only cause the DRM-encrypted audio and video content of the target website to require user authorization before playback. It cannot unlock, decrypt, save, or disseminate any copyright-protected streaming media content, and does not produce any technical effect that infringes the legitimate rights and interests of the copyright owner of the content.

The script runs locally solely on the user's personal device. All operations act only on the current browser page. There is no background networking, data upload, information theft, batch operation or similar behavior. It fully complies with general technical specifications for front-end script development and usage.

This script is for personal non-commercial use, private learning and device experience optimization scenarios only. It is prohibited for commercial operation, batch deployment, public services, infringement for profit and any other commercial or illegal scenarios.

When using this script, the user must strictly abide by the corresponding website user agreements, national cybersecurity laws and regulations, and laws related to copyright protection. If the user uses this script for illegal, infringing or unlawful operations, all legal liabilities and consequences shall be borne solely by the user. The script developer shall not bear any joint liability.

This script is an experience optimization tool with a clear side effect: websites on which it is enabled cannot play DRM-encrypted videos. Users may independently select compliant websites to normally access copyrighted content through script whitelisting or manual page allowance functions, fully respecting content copyright and platform rules.

This script is a free open-source personal tool with no profit motive. The developer provides no express or implied warranty regarding the stability, compatibility or availability of the script. The developer does not authorize any third party to tamper with, re-package, commercially distribute this script. All risks and liabilities arising from third parties' unauthorized use shall have no connection with the developer.
```
