let recorder = null;
let audioContext = null;
let combinedStream = null;
let tabStream = null;
let micStream = null;

let startTime = 0;
let totalPausedTime = 0;
let pauseStartTime = 0;
let isPaused = false;
let isFinishing = false;
let timerInterval = null;
let hasUserInteracted = false;

let micAnalyser = null;
let tabAnalyser = null;
let animFrameId = null;

const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const closeBtn = document.getElementById('closeBtn');
const indicator = document.getElementById('indicator');
const statusBadge = document.getElementById('statusBadge');
const timerDisplay = document.getElementById('timer');
const statusMessage = document.getElementById('statusMessage');
const meetingTagElem = document.getElementById('meetingTag');

const micCanvas = document.getElementById('micMeter');
const tabCanvas = document.getElementById('tabMeter');
const micCtx = micCanvas.getContext('2d');
const tabCtx = tabCanvas.getContext('2d');

// User gesture check to prevent chrome 'beforeunload' console warning
window.addEventListener('pointerdown', () => { hasUserInteracted = true; }, { once: true });
window.addEventListener('keydown', () => { hasUserInteracted = true; }, { once: true });

window.addEventListener('beforeunload', (e) => {
  if (!isFinishing && recorder && recorder.state !== 'inactive' && hasUserInteracted) {
    e.preventDefault();
    e.returnValue = 'Recording active. Are you sure you want to exit?';
    return e.returnValue;
  }
});

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
  const codec = urlParams.get('codec') || 'vp8';
  const bps = parseInt(urlParams.get('bps'), 10) || 2500000;
  const tag = urlParams.get('tag') || 'Meet-Recording';

  meetingTagElem.textContent = tag;

  if (!streamId) {
    statusMessage.textContent = 'Error: Capture token missing.';
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
    closeBtn.style.display = 'block';
    return;
  }

  await startRecording(streamId, micDeviceId, codec, bps, tag);
});

async function startRecording(streamId, micDeviceId, codec, bps, tag) {
  startTime = Date.now();
  statusMessage.textContent = 'Initializing studio audio chain...';

  try {
    // 1. Tab Stream
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
      },
      video: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
      }
    });

    // 2. High-Fidelity Microphone Capture Constraints
    try {
      const micConstraints = {
        audio: {
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false, // Turn off aggressive native AGC
          ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {})
        }
      };
      micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    } catch (micErr) {
      console.warn('High-spec mic constraints failed; using standard audio fallback:', micErr);
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (fallbackErr) {
        micStream = null;
      }
    }

    // 3. Audio Context & DSP Routing
    audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive'
    });

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const destination = audioContext.createMediaStreamDestination();

    // Master Vocal Dynamics Compressor (Broadcast Leveling)
    const masterCompressor = audioContext.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-20, audioContext.currentTime);
    masterCompressor.knee.setValueAtTime(10, audioContext.currentTime);
    masterCompressor.ratio.setValueAtTime(6, audioContext.currentTime);
    masterCompressor.attack.setValueAtTime(0.005, audioContext.currentTime);
    masterCompressor.release.setValueAtTime(0.12, audioContext.currentTime);
    masterCompressor.connect(destination);

    // Tab Audio Routing
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    tabAnalyser = audioContext.createAnalyser();
    tabAnalyser.fftSize = 64;
    tabAnalyser.smoothingTimeConstant = 0.8;

    const tabGain = audioContext.createGain();
    tabGain.gain.setValueAtTime(1.0, audioContext.currentTime);

    tabSource.connect(tabGain);
    tabGain.connect(tabAnalyser);
    tabGain.connect(masterCompressor);
    tabSource.connect(audioContext.destination); // Speaker loopback

    // Mic Audio DSP Chain
    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = audioContext.createMediaStreamSource(micStream);

      // Low-cut / High-pass filter (cuts desk thuds, AC drone below 80 Hz)
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.setValueAtTime(80, audioContext.currentTime);
      highPass.Q.setValueAtTime(0.707, audioContext.currentTime);

      // Speech Presence Boost (2.8 kHz - 3.2 kHz clarity peak)
      const presenceEQ = audioContext.createBiquadFilter();
      presenceEQ.type = 'peaking';
      presenceEQ.frequency.setValueAtTime(3000, audioContext.currentTime);
      presenceEQ.gain.setValueAtTime(2.5, audioContext.currentTime);
      presenceEQ.Q.setValueAtTime(1.0, audioContext.currentTime);

      // Anti-Hiss Low-pass filter (cuts high electronic hiss above 12 kHz)
      const lowPass = audioContext.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.setValueAtTime(12000, audioContext.currentTime);

      // Dedicated Makeup Gain
      const micGain = audioContext.createGain();
      micGain.gain.setValueAtTime(1.25, audioContext.currentTime);

      micAnalyser = audioContext.createAnalyser();
      micAnalyser.fftSize = 64;
      micAnalyser.smoothingTimeConstant = 0.8;

      micSource
        .connect(highPass)
        .connect(presenceEQ)
        .connect(lowPass)
        .connect(micGain);

      micGain.connect(micAnalyser);
      micGain.connect(masterCompressor);
    }

    // 4. Codec & Bitrate Settings
    let selectedMimeType = 'video/webm;codecs=vp8,opus';
    if (codec === 'vp9' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      selectedMimeType = 'video/webm;codecs=vp9,opus';
    } else if (codec === 'h264' && MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
      selectedMimeType = 'video/webm;codecs=h264,opus';
    }

    combinedStream = new MediaStream([
      ...tabStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: bps,
      audioBitsPerSecond: 192000 // 192 kbps high-definition stereo Opus
    });

    recorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        await saveChunk(e.data);
      }
    };

    recorder.onstop = async () => {
      clearInterval(timerInterval);
      cancelAnimationFrame(animFrameId);
      indicator.style.display = 'none';
      stopBtn.style.display = 'none';
      pauseBtn.style.display = 'none';
      statusMessage.textContent = 'Compiling video stream...';

      const effectiveDuration = (Date.now() - startTime) - totalPausedTime;
      const allChunks = await getAllChunks();
      let blob = new Blob(allChunks, { type: selectedMimeType });

      if (typeof ysFixWebmDuration === 'function') {
        try {
          blob = await ysFixWebmDuration(blob, effectiveDuration, { logger: false });
        } catch (err) {
          console.warn('WebM duration patch failed:', err);
        }
      }

      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
      const filename = `${tag}-${dateStr}-${timeStr}.webm`;

      statusMessage.textContent = 'Save file prompt open...';

      chrome.downloads.download(
        {
          url: url,
          filename: filename,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            statusMessage.textContent = 'Download canceled.';
            closeBtn.style.display = 'block';
            return;
          }

          const checkStatus = (delta) => {
            if (delta.id === downloadId && delta.state) {
              if (delta.state.current === 'complete') {
                chrome.downloads.onChanged.removeListener(checkStatus);
                statusMessage.textContent = 'Recording saved successfully!';
                closeBtn.style.display = 'block';
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
                closeBtn.style.display = 'block';
              }
            }
          };

          chrome.downloads.onChanged.addListener(checkStatus);
        }
      );
    };

    recorder.start(1000);
    startTimer();
    renderMeters();
    statusMessage.textContent = '';
  } catch (err) {
    statusMessage.textContent = 'Stream launch failed: ' + err.message;
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
    closeBtn.style.display = 'block';
    await chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
  }
}

pauseBtn.addEventListener('click', () => {
  if (!recorder) return;

  if (!isPaused) {
    recorder.pause();
    isPaused = true;
    pauseStartTime = Date.now();
    statusBadge.textContent = 'PAUSED';
    indicator.querySelector('.dot').style.animationPlayState = 'paused';
    pauseBtn.textContent = 'Resume';
    statusMessage.textContent = 'Recording suspended.';
  } else {
    recorder.resume();
    isPaused = false;
    totalPausedTime += (Date.now() - pauseStartTime);
    statusBadge.textContent = 'LIVE';
    indicator.querySelector('.dot').style.animationPlayState = 'running';
    pauseBtn.textContent = 'Pause';
    statusMessage.textContent = '';
  }
});

stopBtn.addEventListener('click', () => {
  isFinishing = true;
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  stopBtn.textContent = 'Processing...';

  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
});

function renderMeters() {
  const drawBar = (ctx, analyser) => {
    ctx.clearRect(0, 0, 170, 8);
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const width = Math.min(170, (avg / 128) * 170);

    const grad = ctx.createLinearGradient(0, 0, 170, 0);
    grad.addColorStop(0, '#34a853');
    grad.addColorStop(0.7, '#fbbc04');
    grad.addColorStop(1, '#ea4335');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, 8);
  };

  drawBar(micCtx, micAnalyser);
  drawBar(tabCtx, tabAnalyser);

  animFrameId = requestAnimationFrame(renderMeters);
}

function cleanup() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());
  if (tabStream) tabStream.getTracks().forEach((t) => t.stop());
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  if (audioContext && audioContext.state !== 'closed') audioContext.close();
}

function startTimer() {
  timerInterval = setInterval(() => {
    if (isPaused) return;

    const elapsed = Math.floor(((Date.now() - startTime) - totalPausedTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}