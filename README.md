# Don't Touch My NVIDIA Instant Replay
**English** | [中文](README_CN.md)
> When turning off the Instant Replay feature on a user's PC, user consent must be obtained first.

A Tampermonkey userscript that intercepts the browser EME API and prevents the browser from automatically loading the Widevine CDM. It stops web pages from arbitrarily disabling NVIDIA ShadowPlay Instant Replay, keeping Instant Replay active until the user manually grants permission for the site.

**Warning:** After the script blocks EME calls, DRM-encrypted videos on blocked sites will fail to play. This script is not intended to record DRM-protected content and involves no copyright infringement. It only targets abusive behavior: websites and NVIDIA’s mechanism force local Instant Replay to shut down without user approval. The replay function will not automatically resume, and unsaved recordings may be lost. This issue can occur even on many websites that do not serve DRM content at all. If you need to watch encrypted videos, add the site to the allowlist. Instant Replay will then be blocked normally by the site following the original logic.

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
