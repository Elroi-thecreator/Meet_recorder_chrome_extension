const startBtn = document.getElementById('startBtn');
const recoverBtn = document.getElementById('recoverBtn');
const statusText = document.getElementById('statusText');
const micSelect = document.getElementById('micSelect');
const codecSelect = document.getElementById('codecSelect');

document.addEventListener('DOMContentLoaded', async () => {
  await checkRecoverableChunks();
  await populateAudioInputs();
  await syncRecordingState();
});

micSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedMicId: micSelect.value });
});

codecSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedCodec: codecSelect.value });
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
  const data = await chrome.storage.local.get(['isRecording', 'recorderWindowId', 'selectedMicId', 'selectedCodec']);

  if (data.selectedMicId && micSelect.querySelector(`option[value="${data.selectedMicId}"]`)) {
    micSelect.value = data.selectedMicId;
  }
  if (data.selectedCodec && codecSelect.querySelector(`option[value="${data.selectedCodec}"]`)) {
    codecSelect.value = data.selectedCodec;
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
      statusText.textContent = 'Recording currently active.';
      startBtn.disabled = true;
      micSelect.disabled = true;
      codecSelect.disabled = true;
      return;
    } else {
      await chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
    }
  }

  statusText.textContent = 'Ready';
  startBtn.disabled = false;
  micSelect.disabled = false;
  codecSelect.disabled = false;
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
      statusText.textContent = 'Grant mic permission in tab.';
      return;
    }
  } catch (e) {}

  statusText.textContent = 'Locating meeting tab...';

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) {
    statusText.textContent = 'No active tab detected.';
    return;
  }

  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
    statusText.textContent = 'Cannot record internal browser pages.';
    return;
  }

  let meetingTag = 'Meet-Recording';
  if (tab.url && tab.url.includes('meet.google.com/')) {
    const meetMatch = tab.url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    if (meetMatch && meetMatch[1]) {
      meetingTag = `Meet-${meetMatch[1]}`;
    }
  }

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    if (!streamId) {
      statusText.textContent = 'Tab capture authorization rejected.';
      return;
    }

    const [codecType, bitrate] = codecSelect.value.split('|');

    const params = new URLSearchParams({
      streamId: streamId,
      micId: micSelect.value || '',
      codec: codecType,
      bps: bitrate,
      tag: meetingTag
    });

    const win = await chrome.windows.create({
      url: `recorder.html?${params.toString()}`,
      type: 'popup',
      width: 340,
      height: 380,
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