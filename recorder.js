let recorder = null;
let audioContext = null;
let combinedStream = null;
let tabStream = null;
let micStream = null;
let startTime = 0;
let isFinishing = false;
let timerInterval = null;
let hasUserInteracted = false;

const stopBtn = document.getElementById('stopBtn');
const closeBtn = document.getElementById('closeBtn');
const indicator = document.getElementById('indicator');
const timerDisplay = document.getElementById('timer');
const statusMessage = document.getElementById('statusMessage');

// Track interaction so beforeunload is only invoked after a real gesture
window.addEventListener('pointerdown', () => { hasUserInteracted = true; }, { once: true });
window.addEventListener('keydown', () => { hasUserInteracted = true; }, { once: true });

window.addEventListener('beforeunload', (e) => {
  if (!isFinishing && recorder && recorder.state === 'recording' && hasUserInteracted) {
    e.preventDefault();
    e.returnValue = 'Recording in progress. Are you sure you want to exit?';
    return e.returnValue;
  }
});

// Emergency cleanup if closed abruptly
window.addEventListener('pagehide', () => {
  cleanup();
});

closeBtn.addEventListener('click', () => {
  window.close();
});

document.addEventListener('DOMContentLoaded', async () => {
  await clearChunks();

  const urlParams = new URLSearchParams(window.location.search);
  const streamId = urlParams.get('streamId');
  const micDeviceId = urlParams.get('micId');

  if (!streamId) {
    statusMessage.textContent = 'Error: Capture stream token missing.';
    stopBtn.disabled = true;
    closeBtn.style.display = 'inline-block';
    return;
  }

  await startRecording(streamId, micDeviceId);
});

async function startRecording(streamId, micDeviceId) {
  startTime = Date.now();
  statusMessage.textContent = 'Connecting streams...';

  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    try {
      const micConstraints = micDeviceId ? { deviceId: { exact: micDeviceId } } : true;
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints
      });
    } catch (micErr) {
      console.warn('Microphone stream unavailable, recording tab audio only:', micErr);
      micStream = null;
    }

    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const destination = audioContext.createMediaStreamDestination();
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    tabSource.connect(destination);
    tabSource.connect(audioContext.destination);

    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);
    }

    combinedStream = new MediaStream([
      ...tabStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    recorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp8,opus'
    });

    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        await saveChunk(e.data);
      }
    };

    recorder.onstop = async () => {
      clearInterval(timerInterval);
      indicator.style.display = 'none';
      stopBtn.style.display = 'none';
      statusMessage.textContent = 'Preparing video file...';

      const duration = Date.now() - startTime;
      const allChunks = await getAllChunks();
      let blob = new Blob(allChunks, { type: 'video/webm' });

      if (typeof ysFixWebmDuration === 'function') {
        try {
          blob = await ysFixWebmDuration(blob, duration, { logger: false });
        } catch (err) {
          console.warn('WebM duration fix failed:', err);
        }
      }

      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
      const filename = `Meet-Recording-${dateStr}-${timeStr}.webm`;

      statusMessage.textContent = 'Choose save destination in prompt...';

      chrome.downloads.download(
        {
          url: url,
          filename: filename,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            statusMessage.textContent = 'Save canceled or blocked.';
            closeBtn.style.display = 'inline-block';
            return;
          }

          const checkStatus = (delta) => {
            if (delta.id === downloadId && delta.state) {
              if (delta.state.current === 'complete') {
                chrome.downloads.onChanged.removeListener(checkStatus);
                statusMessage.textContent = 'Recording saved successfully!';
                closeBtn.style.display = 'inline-block';
                cleanup();
                clearChunks();
                chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  window.close();
                }, 2000);
              } else if (delta.state.current === 'interrupted') {
                chrome.downloads.onChanged.removeListener(checkStatus);
                statusMessage.textContent = 'Download interrupted.';
                closeBtn.style.display = 'inline-block';
              }
            }
          };

          chrome.downloads.onChanged.addListener(checkStatus);
        }
      );
    };

    recorder.start(1000);
    startTimer();
    statusMessage.textContent = '';
  } catch (err) {
    statusMessage.textContent = 'Initialization failed: ' + err.message;
    stopBtn.disabled = true;
    closeBtn.style.display = 'inline-block';
    await chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
  }
}

stopBtn.addEventListener('click', () => {
  isFinishing = true;
  stopBtn.disabled = true;
  stopBtn.textContent = 'Processing...';

  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
});

function cleanup() {
  if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());
  if (tabStream) tabStream.getTracks().forEach((t) => t.stop());
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  if (audioContext && audioContext.state !== 'closed') audioContext.close();
}

function startTimer() {
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}