# Don't Touch My NVIDIA Instant Replay
**English** | [中文](README_CN.md)
### "When disabling features belonging to the user's computer, user consent shall be obtained first."

A Tampermonkey script to intercept browser EME API calls, preventing the browser from automatically loading the Widevine CDM. It stops web pages from arbitrarily turning off NVIDIA ShadowPlay Instant Replay, protecting Instant Replay to keep running until the user manually authorizes the site.

**WARNING: This script is NOT intended to evade, bypass or crack DRM copyright protection mechanisms. It does not crack paid content, nor does it grant the browser the ability to record DRM-encrypted video content. After the script blocks EME invocations, DRM-encrypted videos on blocked sites will fail to play. The script only targets unauthorized termination of Instant Replay: a mechanism between websites and NVIDIA forces local Instant Replay to shut down without user permission. The replay will not resume automatically, and unsaved recorded footage may be lost. Even many websites that serve no DRM content can trigger Instant Replay shutdown. To view encrypted videos, users need to manually select to allow access. In this case, instant replay will still be blocked by the site following the original logic before DRM content can be played.**

<img width="276" height="217" alt="image" src="https://github.com/user-attachments/assets/5f1650e7-30c6-4ad3-8be7-e40d71830652" />

## Features
- Intercept browser APIs related to EME / Widevine on target websites
- Two blocking modes: `reject` (directly throw NotSupportedError), `hang` (return a Promise that never resolves)
- Allow temporary whitelisting for the current session, or permanent addition to the allowlist
- A corner icon entry shown at the bottom-right of the webpage, or hotkey `Alt+E` to manually open the control panel

## Installation
1. Install a userscript manager: Tampermonkey / Violentmonkey
2. Import the script
3. Navigate to web pages. When a DRM request from the page is intercepted, a control icon will appear at the bottom-right corner.

## Legal Disclaimer
```
This script is a pure front-end browser functional optimization tool intended for personal use only on the user's local device. It has no development intent to crack, bypass or tamper with copyright protection systems. The core function of the script is to intercept the loading and invocation of the Encrypted Media Extensions (EME) and Widevine CDM modules on web pages. Its primary purpose is to prevent NVIDIA ShadowPlay instant replay from being forcibly interrupted when the browser loads copyright protection modules, optimizing local screen recording experience. This constitutes an experience optimization action for the user's personal device.

This script represents custom configuration optimization for the user's personal browser client. It does not involve illegal technical acts such as server-side tampering, network data hijacking, or encryption protocol cracking. The script contains no code logic for decrypting, stealing, tampering with, copying or disseminating copyrighted audio and video content. It does not modify or bypass core website copyright verification mechanisms, nor does it break any payment access permissions or content access restrictions. It possesses no technical capability for infringement or violation.

After the script takes effect, it will only cause DRM-encrypted audio and video content on target websites to fail to play normally. It cannot unlock, decrypt, save or disseminate any copyright-protected streaming media content and has no technical effect of infringing the legitimate rights and interests of content copyright holders.

The script runs locally solely on the user's personal device. All operations act only on the current browser page. There is no background networking, data upload, information theft, batch operation or similar behavior. It fully complies with general technical specifications for front-end script development and usage.

This script is for personal non-commercial use, private learning and device experience optimization scenarios only. It is prohibited for commercial operation, batch deployment, public services, infringement for profit and any other commercial or illegal scenarios.

When using this script, the user must strictly abide by the corresponding website user agreements, national cybersecurity laws and regulations, and laws related to copyright protection. If the user uses this script for illegal, infringing or unlawful operations, all legal liabilities and consequences shall be borne solely by the user. The script developer shall not bear any joint liability.

This script is an experience optimization tool with a clear side effect: websites on which it is enabled cannot play DRM-encrypted videos. Users may independently select compliant websites to normally access copyrighted content through script whitelisting or manual page allowance functions, fully respecting content copyright and platform rules.

This script is a free open-source personal tool with no profit motive. The developer provides no express or implied warranty regarding the stability, compatibility or availability of the script. The developer does not authorize any third party to tamper with, re-package, commercially distribute this script. All risks and liabilities arising from third parties' unauthorized use shall have no connection with the developer.
```
