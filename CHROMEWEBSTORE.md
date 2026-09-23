# Chrome Web Store Listing — Meet Screen & Audio Recorder Pro

> Last Updated: 2026-09-23

---

## Store Listing

**Extension Name** [REQUIRED]
Meet Screen & Audio Recorder Pro

**Short Description** [REQUIRED]
Studio-grade Google Meet recorder with 48kHz DSP audio chain, pause/resume, and auto-naming.

**Detailed Description** [REQUIRED]
Record Google Meet calls with studio-grade sound quality, crystal-clear tab audio, and zero lost data.

Meet Screen & Audio Recorder Pro turns your browser into a complete recording studio designed specifically for Google Meet conferences, lectures, presentations, and interviews.

KEY FEATURES:
• Studio-Grade Voice Processing: Enhances your microphone sound with real-time vocal leveling, gentle background rumble filtering, and vocal clarity tuning so your voice sounds crisp and balanced against other attendees.
• Full Internal Meeting Sound: Captures meeting audio and video directly while allowing you to keep listening comfortably through your speakers or headphones.
• Interactive Floating Studio Window: Keep full control of your recording with real-time audio volume meters, elapsed timer, pause/resume controls, and quick mute buttons for both your microphone and meeting tab sound.
• Fail-Safe Crash Recovery: Records video chunks locally in real-time. If your browser or meeting tab closes accidentally, you can recover your recording directly from the popup.
• Automatic Meeting File Naming: Automatically identifies the Google Meet session code and timestamps your recordings so your files stay organized.
• Multiple Video Encodings: Choose between H.264, VP8, and VP9 encoding profiles to optimize between crisp presentation text or smaller file sizes.
• Optional Live Streaming: Forward live audio and video to YouTube Live with your custom stream key.

HOW TO USE:
1. Join your Google Meet conference in Chrome.
2. Click the Meet Screen & Audio Recorder Pro extension icon in your toolbar.
3. Select your microphone and preferred video quality profile.
4. Click "Start Recording" to launch the studio window and begin capturing.
5. Use the studio window to pause, mute channels, or monitor audio levels during the meeting.
6. Click "Stop & Save" when finished to download the recording file directly to your computer.

PRIVACY FIRST:
All video and audio processing runs 100% locally inside your browser. No meeting recordings, personal data, or browsing history are ever collected, transmitted to external servers, or sold.

SUPPORT & FEEDBACK:
For feature requests, bug reports, and updates, visit:
https://github.com/Elroi-thecreator/Meet_recorder_chrome_extension/issues

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Records Google Meet tabs with high-quality microphone audio and saves video files locally to your computer.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Needs capture | Meeting tab with active recording |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs capture | Extension popup with microphone and codec selector |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs capture | Floating studio window with live VU meters and mute controls |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | Promo tile for store feature |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | Banner graphic |

### Screenshot Guidance
1. **Screenshot 1 (Main Action):** A clean Google Meet session with the floating studio window visible showing live recording in progress, timer counting, and audio level meters.
2. **Screenshot 2 (Setup Popup):** The extension popup menu showing the clean dropdowns for microphone selection, encoding profiles (H.264, VP8, VP9), and output destinations.
3. **Screenshot 3 (Controls & Recovery):** The floating studio window highlighting the Mute Mic, Mute Tab, and Pause/Resume controls.

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `tabCapture` | permissions | Required to capture the audio and video stream of the active Google Meet tab being recorded. |
| `activeTab` | permissions | Required to read the active Google Meet URL to detect the meeting room code for automatic file naming, and authorize tab capture upon clicking the extension icon. |
| `storage` | permissions | Required to store user preferences locally, including preferred microphone hardware device, chosen video encoding profile, and destination settings. |
| `unlimitedStorage` | permissions | Required to temporarily store video data chunks locally in IndexedDB to prevent recording data loss during long meetings or unexpected browser crashes. |
| `downloads` | permissions | Required to save and export the finalized video recording file directly to the user's Downloads folder. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

All media streams and user settings are kept strictly local on the user's computer. No user data is gathered or transmitted off-device.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/Elroi-thecreator/Meet_recorder_chrome_extension/blob/main/PRIVACY_POLICY.md

---

## Distribution

**Visibility**: Public
**Regions**: All regions

---

## Developer Info

**Publisher Name** [REQUIRED]
Elroi-thecreator

**Contact Email** [REQUIRED]
*(Enter your developer contact email registered on the Chrome Developer Console)*

**Support URL** [RECOMMENDED]
https://github.com/Elroi-thecreator/Meet_recorder_chrome_extension/issues

**Homepage URL** [RECOMMENDED]
https://github.com/Elroi-thecreator/Meet_recorder_chrome_extension

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.2.0 | 2026-09-23 | Added Mute Mic & Mute Tab controls with audio DSP gain ramping, WebM duration fix, and store readiness. | Draft |

---

## Review Notes

### Known Details for Reviewers
- The extension captures only the specific tab the user explicitly selects via user gesture.
- Audio is processed entirely via standard Web Audio API and MediaRecorder API.
- IndexedDB storage is used solely as a temporary crash-resilience buffer while recording is active.
