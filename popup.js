const startBtn = document.getElementById('startBtn');
const recoverBtn = document.getElementById('recoverBtn');
const statusText = document.getElementById('statusText');
const micSelect = document.getElementById('micSelect');

document.addEventListener('DOMContentLoaded', async () => {
  await checkRecoverableChunks();
  await populateAudioInputs();
  await syncRecordingState();
});

micSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedMicId: micSelect.value });
});

async function checkRecoverableChunks() {
  try {
    const existingChunks = await getAllChunks();
    if (existingChunks && existingChunks.length > 0) {
      recoverBtn.style.display = 'block';
      recoverBtn.onclick = async () => {
        recoverBtn.disabled = true;
        recoverBtn.textContent = 'Exporting...';
        
        const blob = new Blob(existingChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Recovered-Meet-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        
        await clearChunks();
        recoverBtn.style.display = 'none';
      };
    }
  } catch (err) {
    console.error('Failed to query IndexedDB:', err);
  }
}

async function syncRecordingState() {
  const data = await chrome.storage.local.get(['isRecording', 'recorderWindowId', 'selectedMicId']);

  if (data.selectedMicId && micSelect.querySelector(`option[value="${data.selectedMicId}"]`)) {
    micSelect.value = data.selectedMicId;
  }

  if (data.isRecording) {
    let windowStillOpen = false;

    if (data.recorderWindowId) {
      try {
        const win = await chrome.windows.get(data.recorderWindowId);
        if (win) windowStillOpen = true;
      } catch (e) {
        windowStillOpen = false;
      }
    }

    if (windowStillOpen) {
      statusText.textContent = 'Recording in progress...';
      startBtn.disabled = true;
      micSelect.disabled = true;
      return;
    } else {
      await chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
    }
  }

  statusText.textContent = 'Ready';
  startBtn.disabled = false;
  micSelect.disabled = false;
}

async function populateAudioInputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');

    micSelect.innerHTML = '';
    const hasLabels = audioInputs.some((d) => d.label.length > 0);

    if (!hasLabels || audioInputs.length === 0) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Default Microphone';
      micSelect.appendChild(defaultOption);
      return;
    }

    let selectedIndex = 0;
    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Microphone ${index + 1}`;

      const name = (device.label || '').toLowerCase();
      if (name.includes('headset') || name.includes('bluetooth') || name.includes('earphone')) {
        selectedIndex = index;
      }
      micSelect.appendChild(option);
    });

    micSelect.selectedIndex = selectedIndex;
  } catch (err) {
    micSelect.innerHTML = '<option value="">Default Microphone</option>';
  }
}

startBtn.addEventListener('click', async () => {
  statusText.textContent = 'Verifying permissions...';

  try {
    const perm = await navigator.permissions.query({ name: 'microphone' });
    if (perm.state !== 'granted') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
      statusText.textContent = 'Grant mic permission in opened tab.';
      return;
    }
  } catch (e) {}

  statusText.textContent = 'Authorizing tab capture...';

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) {
    statusText.textContent = 'No active tab detected.';
    return;
  }

  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
    statusText.textContent = 'Cannot record internal browser pages.';
    return;
  }

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    if (!streamId) {
      statusText.textContent = 'Tab capture authorization rejected.';
      return;
    }

    const streamUrl = `recorder.html?streamId=${encodeURIComponent(streamId)}&micId=${encodeURIComponent(micSelect.value || '')}`;

    const win = await chrome.windows.create({
      url: streamUrl,
      type: 'popup',
      width: 320,
      height: 240,
      focused: true
    });

    await chrome.storage.local.set({
      recorderWindowId: win.id,
      isRecording: true
    });

    window.close();
  } catch (err) {
    statusText.textContent = 'Capture error: ' + err.message;
  }
});