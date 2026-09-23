# Privacy Policy for Meet Screen & Audio Recorder Pro

**Last Updated:** September 23, 2026

Meet Screen & Audio Recorder Pro ("the Extension") is dedicated to protecting your privacy. This Privacy Policy explains our practices regarding data collection, use, and user control.

---

## 1. Data Collection & Processing

**Meet Screen & Audio Recorder Pro does not collect, sell, or transmit any personal data, browsing history, or identifiable information to external servers.**

- **Audio & Video Capture:** All tab and microphone capture occurs locally in your browser. Video and audio streams are processed exclusively on your device.
- **Local Storage & Crash Recovery:** Recording chunks are temporarily stored locally on your device in browser IndexedDB storage (`MeetRecorderDB`) solely to prevent data loss in the event of an unexpected tab or browser crash. These temporary chunks are cleared once the recording is saved or upon user request.
- **Settings & Preferences:** Your preferred microphone device ID, encoding profile, and destination preferences are saved locally on your device using Chrome's local storage API (`chrome.storage.local`).
- **Optional Live Streaming:** If you choose to use the optional YouTube Live streaming feature, video and audio data is sent directly to the WebSocket relay server URL and stream key you provide. We operate no tracking or analytics servers.

---

## 2. Permissions & How They Are Used

The Extension requests the following browser permissions strictly for its core recording functionality:

| Permission | Purpose |
|------------|---------|
| `tabCapture` | Captures the video and audio of the active Google Meet tab being recorded. |
| `activeTab` | Detects the active meeting tab to identify the meeting code for automatic file naming. |
| `storage` | Saves user preferences (selected microphone, codec, output mode) locally on your device. |
| `unlimitedStorage` | Allows local IndexedDB storage of temporary video chunks to ensure uninterrupted recording of long meetings. |
| `downloads` | Saves the finalized video recording file directly to your local Downloads folder. |

---

## 3. Third-Party Services & Analytics

- The Extension does **not** contain analytics software, tracking pixels, or advertising SDKs.
- The Extension does **not** transfer or sell user data to any third party.
- No cookies are created or tracked by this Extension.

---

## 4. User Controls & Data Deletion

- All saved recordings are stored on your local drive and are completely under your control.
- Any temporary crash recovery chunks stored in IndexedDB can be exported or purged at any time from the extension popup.
- Uninstalling the Extension instantly and permanently removes all stored extension preferences and local database records.

---

## 5. Contact & Support

If you have any questions or feedback regarding this Privacy Policy, please contact the developer via GitHub Issues:
https://github.com/Elroi-thecreator/Meet_recorder_chrome_extension/issues
