let recorder = null;
let liveStreamRecorder = null;
let wsRelay = null;
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

let micGain = null;
let tabGain = null;
let isMicMuted = false;
let isTabMuted = false;
let micVolMultiplier = 1.0;
let tabVolMultiplier = 1.0;
const MIC_TARGET_GAIN = 1.25;
const TAB_TARGET_GAIN = 1.0;

const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const closeBtn = document.getElementById('closeBtn');
const muteMicBtn = document.getElementById('muteMicBtn');
const muteTabBtn = document.getElementById('muteTabBtn');
const micVolumeSlider = document.getElementById('micVolume');
const tabVolumeSlider = document.getElementById('tabVolume');
const micVolVal = document.getElementById('micVolVal');
const tabVolVal = document.getElementById('tabVolVal');
const tabLabel = document.getElementById('tabLabel');
const screenPickerPrompt = document.getElementById('screenPickerPrompt');
const selectScreenBtn = document.getElementById('selectScreenBtn');

const indicator = document.getElementById('indicator');
const statusBadge = document.getElementById('statusBadge');
const modeBadge = document.getElementById('modeBadge');
const ytBadge = document.getElementById('ytBadge');
const timerDisplay = document.getElementById('timer');
const statusMessage = document.getElementById('statusMessage');
const meetingTagElem = document.getElementById('meetingTag');

const micCanvas = document.getElementById('micMeter');
const tabCanvas = document.getElementById('tabMeter');
const micCtx = micCanvas.getContext('2d');
const tabCtx = tabCanvas.getContext('2d');

function toggleMicMute() {
  if (!audioContext || !micGain) return;
  isMicMuted = !isMicMuted;
  const now = audioContext.currentTime;
  micGain.gain.cancelScheduledValues(now);
  if (isMicMuted) {
    micGain.gain.linearRampToValueAtTime(0, now + 0.05);
    muteMicBtn.textContent = 'Muted';
    muteMicBtn.classList.add('muted');
    muteMicBtn.setAttribute('title', 'Unmute Microphone');
  } else {
    micGain.gain.linearRampToValueAtTime(micVolMultiplier * MIC_TARGET_GAIN, now + 0.05);
    muteMicBtn.textContent = 'Mute';
    muteMicBtn.classList.remove('muted');
    muteMicBtn.setAttribute('title', 'Mute Microphone');
  }
}

function toggleTabMute() {
  if (!audioContext || !tabGain) return;
  isTabMuted = !isTabMuted;
  const now = audioContext.currentTime;
  tabGain.gain.cancelScheduledValues(now);
  if (isTabMuted) {
    tabGain.gain.linearRampToValueAtTime(0, now + 0.05);
    muteTabBtn.textContent = 'Muted';
    muteTabBtn.classList.add('muted');
    muteTabBtn.setAttribute('title', 'Unmute Audio');
  } else {
    tabGain.gain.linearRampToValueAtTime(tabVolMultiplier * TAB_TARGET_GAIN, now + 0.05);
    muteTabBtn.textContent = 'Mute';
    muteTabBtn.classList.remove('muted');
    muteTabBtn.setAttribute('title', 'Mute Audio');
  }
}

if (muteMicBtn) muteMicBtn.addEventListener('click', toggleMicMute);
if (muteTabBtn) muteTabBtn.addEventListener('click', toggleTabMute);

if (micVolumeSlider) {
  micVolumeSlider.addEventListener('input', () => {
    const val = parseInt(micVolumeSlider.value, 10);
    micVolMultiplier = val / 100;
    if (micVolVal) micVolVal.textContent = `${val}%`;
    if (!isMicMuted && audioContext && micGain) {
      const now = audioContext.currentTime;
      micGain.gain.cancelScheduledValues(now);
      micGain.gain.linearRampToValueAtTime(micVolMultiplier * MIC_TARGET_GAIN, now + 0.05);
    }
  });
}

if (tabVolumeSlider) {
  tabVolumeSlider.addEventListener('input', () => {
    const val = parseInt(tabVolumeSlider.value, 10);
    tabVolMultiplier = val / 100;
    if (tabVolVal) tabVolVal.textContent = `${val}%`;
    if (!isTabMuted && audioContext && tabGain) {
      const now = audioContext.currentTime;
      tabGain.gain.cancelScheduledValues(now);
      tabGain.gain.linearRampToValueAtTime(tabVolMultiplier * TAB_TARGET_GAIN, now + 0.05);
    }
  });
}

window.addEventListener('pointerdown', () => { hasUserInteracted = true; }, { once: true });
window.addEventListener('keydown', () => { hasUserInteracted = true; }, { once: true });

window.addEventListener('beforeunload', (e) => {
  const isRecordingActive = (recorder && recorder.state !== 'inactive') ||
                            (liveStreamRecorder && liveStreamRecorder.state !== 'inactive');
  if (!isFinishing && isRecordingActive && hasUserInteracted) {
    e.preventDefault();
    e.returnValue = 'Recording/Streaming is active. Are you sure you want to exit?';
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
  const sourceMode = urlParams.get('source') || 'tab';
  const streamId = urlParams.get('streamId');
  const micDeviceId = urlParams.get('micId');
  const codec = urlParams.get('codec') || 'h264';
  const bps = parseInt(urlParams.get('bps'), 10) || 3000000;
  const tag = urlParams.get('tag') || (sourceMode === 'screen' ? 'Screen-Recording' : 'Meet-Recording');
  const destMode = urlParams.get('destMode') || 'local'; // 'local', 'yt', 'both'
  const relayUrl = urlParams.get('relayUrl');
  const streamKey = urlParams.get('streamKey');

  meetingTagElem.textContent = tag;

  if (sourceMode === 'screen' && tabLabel) {
    tabLabel.textContent = 'SCREEN';
  }

  if (destMode === 'local') {
    modeBadge.textContent = sourceMode === 'screen' ? 'SCREEN ONLY' : 'LOCAL ONLY';
    stopBtn.textContent = 'Stop & Save';
  } else if (destMode === 'both') {
    modeBadge.textContent = sourceMode === 'screen' ? 'SCREEN + YT' : 'LOCAL + YT';
    stopBtn.textContent = 'Stop & Save';
  } else if (destMode === 'yt') {
    modeBadge.textContent = sourceMode === 'screen' ? 'SCREEN YT' : 'YT LIVE ONLY';
    stopBtn.textContent = 'Stop Stream';
  }

  if (sourceMode === 'screen') {
    if (screenPickerPrompt) screenPickerPrompt.style.display = 'block';
    stopBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    statusMessage.textContent = 'Select a screen, window, or tab.';

    if (selectScreenBtn) {
      selectScreenBtn.onclick = async () => {
        selectScreenBtn.disabled = true;
        selectScreenBtn.textContent = 'Selecting screen...';
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'monitor',
              frameRate: { ideal: 30, max: 60 }
            },
            audio: true
          });

          if (screenPickerPrompt) screenPickerPrompt.style.display = 'none';
          stopBtn.style.display = 'inline-block';
          pauseBtn.style.display = 'inline-block';
          statusMessage.textContent = '';

          await startCapture('screen', displayStream, micDeviceId, codec, bps, tag, destMode, relayUrl, streamKey);
        } catch (err) {
          selectScreenBtn.disabled = false;
          selectScreenBtn.textContent = 'Choose Screen / Window';
          statusMessage.textContent = 'Screen selection canceled: ' + err.message;
        }
      };
    }
  } else {
    // Tab mode
    if (!streamId) {
      statusMessage.textContent = 'Error: Capture token missing.';
      stopBtn.disabled = true;
      pauseBtn.disabled = true;
      closeBtn.style.display = 'block';
      return;
    }

    await startCapture('tab', streamId, micDeviceId, codec, bps, tag, destMode, relayUrl, streamKey);
  }
});

async function startCapture(sourceMode, streamOrId, micDeviceId, codec, bps, tag, destMode, relayUrl, streamKey) {
  startTime = Date.now();
  statusMessage.textContent = 'Initializing media hardware...';

  try {
    // 1. Tab or Screen Stream
    if (sourceMode === 'screen') {
      tabStream = streamOrId;
    } else {
      tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamOrId }
        },
        video: {
          mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamOrId }
        }
      });
    }

    // Auto-stop if user ends screen sharing from native browser bar
    const primaryVideoTrack = tabStream ? tabStream.getVideoTracks()[0] : null;
    if (primaryVideoTrack) {
      primaryVideoTrack.addEventListener('ended', () => {
        if (!isFinishing && stopBtn && stopBtn.style.display !== 'none' && !stopBtn.disabled) {
          stopBtn.click();
        }
      });
    }

    // 2. Microphone Capture
    try {
      const micConstraints = {
        audio: {
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {})
        }
      };
      micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    } catch (micErr) {
      console.warn('DSP Mic setup failed, using basic mic:', micErr);
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        micStream = null;
      }
    }

    // 3. Audio Context & DSP Chain
    audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const destination = audioContext.createMediaStreamDestination();

    const masterCompressor = audioContext.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-20, audioContext.currentTime);
    masterCompressor.knee.setValueAtTime(10, audioContext.currentTime);
    masterCompressor.ratio.setValueAtTime(6, audioContext.currentTime);
    masterCompressor.attack.setValueAtTime(0.005, audioContext.currentTime);
    masterCompressor.release.setValueAtTime(0.12, audioContext.currentTime);
    masterCompressor.connect(destination);

    if (tabStream && tabStream.getAudioTracks().length > 0) {
      const tabSource = audioContext.createMediaStreamSource(tabStream);
      tabAnalyser = audioContext.createAnalyser();
      tabAnalyser.fftSize = 64;
      tabAnalyser.smoothingTimeConstant = 0.8;

      tabGain = audioContext.createGain();
      tabGain.gain.setValueAtTime(isTabMuted ? 0 : (tabVolMultiplier * TAB_TARGET_GAIN), audioContext.currentTime);

      tabSource.connect(tabGain);
      tabGain.connect(tabAnalyser);
      tabGain.connect(masterCompressor);

      // In tab capture, tab is silenced by Chrome so route to speakers; screen audio is already heard
      if (sourceMode === 'tab') {
        tabSource.connect(audioContext.destination);
      }
    } else {
      tabAnalyser = null;
    }

    if (micStream && micStream.getAudioTracks().length > 0) {
      const micSource = audioContext.createMediaStreamSource(micStream);

      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.setValueAtTime(80, audioContext.currentTime);
      highPass.Q.setValueAtTime(0.707, audioContext.currentTime);

      const presenceEQ = audioContext.createBiquadFilter();
      presenceEQ.type = 'peaking';
      presenceEQ.frequency.setValueAtTime(3000, audioContext.currentTime);
      presenceEQ.gain.setValueAtTime(2.5, audioContext.currentTime);
      presenceEQ.Q.setValueAtTime(1.0, audioContext.currentTime);

      const lowPass = audioContext.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.setValueAtTime(12000, audioContext.currentTime);

      micGain = audioContext.createGain();
      micGain.gain.setValueAtTime(isMicMuted ? 0 : (micVolMultiplier * MIC_TARGET_GAIN), audioContext.currentTime);

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

    // 4. Combined MediaStream
    combinedStream = new MediaStream([
      ...tabStream.getVideoTracks(),
      ...destination.stream.getAudioTracks()
    ]);

    // Determine Supported Codec
    let selectedMimeType = 'video/webm;codecs=vp8,opus';
    if (codec === 'h264' && MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
      selectedMimeType = 'video/webm;codecs=h264,opus';
    } else if (codec === 'vp9' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      selectedMimeType = 'video/webm;codecs=vp9,opus';
    }

    // 5. Initialize Local Recorder if enabled
    const recordLocal = (destMode === 'local' || destMode === 'both');
    if (recordLocal) {
      recorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bps,
        audioBitsPerSecond: 192000
      });

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          await saveChunk(e.data);
        }
      };

      recorder.onstop = async () => {
        statusMessage.textContent = 'Compiling local recording...';

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

        statusMessage.textContent = 'Save dialog prompt open...';

        chrome.downloads.download(
          { url: url, filename: filename, saveAs: true },
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
    }

    // 6. Initialize YouTube Stream if enabled
    const streamYt = (destMode === 'yt' || destMode === 'both');
    if (streamYt && relayUrl && streamKey) {
      initYouTubeStream(combinedStream, relayUrl, streamKey);
    }

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

function initYouTubeStream(stream, relayUrl, streamKey) {
  try {
    const wsTarget = new URL(relayUrl);
    wsTarget.searchParams.set('key', streamKey);

    wsRelay = new WebSocket(wsTarget.toString());
    wsRelay.binaryType = 'arraybuffer';

    wsRelay.onopen = () => {
      ytBadge.style.display = 'inline-block';
      ytBadge.textContent = 'YT LIVE';
      ytBadge.style.background = '#cc0000';

      let streamMime = 'video/webm;codecs=h264,opus';
      if (!MediaRecorder.isTypeSupported(streamMime)) {
        streamMime = 'video/webm;codecs=vp8,opus';
      }

      liveStreamRecorder = new MediaRecorder(stream, {
        mimeType: streamMime,
        videoBitsPerSecond: 3000000,
        audioBitsPerSecond: 128000
      });

      liveStreamRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && wsRelay && wsRelay.readyState === WebSocket.OPEN) {
          const buffer = await e.data.arrayBuffer();
          wsRelay.send(buffer);
        }
      };

      liveStreamRecorder.start(1000);
    };

    wsRelay.onerror = (err) => {
      console.error('Relay WebSocket error:', err);
      ytBadge.textContent = 'YT ERR';
      ytBadge.style.background = '#5f6368';
    };

    wsRelay.onclose = () => {
      ytBadge.style.display = 'none';
      if (liveStreamRecorder && liveStreamRecorder.state !== 'inactive') {
        liveStreamRecorder.stop();
      }
    };
  } catch (err) {
    console.error('Failed to initialize YouTube live pipeline:', err);
  }
}

pauseBtn.addEventListener('click', () => {
  if (!isPaused) {
    if (recorder && recorder.state === 'recording') recorder.pause();
    if (liveStreamRecorder && liveStreamRecorder.state === 'recording') liveStreamRecorder.pause();

    isPaused = true;
    pauseStartTime = Date.now();
    statusBadge.textContent = 'PAUSED';
    indicator.querySelector('.dot').style.animationPlayState = 'paused';
    pauseBtn.textContent = 'Resume';
    statusMessage.textContent = 'Session suspended.';
  } else {
    if (recorder && recorder.state === 'paused') recorder.resume();
    if (liveStreamRecorder && liveStreamRecorder.state === 'paused') liveStreamRecorder.resume();

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

  clearInterval(timerInterval);
  cancelAnimationFrame(animFrameId);
  indicator.style.display = 'none';
  stopBtn.style.display = 'none';
  pauseBtn.style.display = 'none';

  // Terminate YouTube stream if active
  if (liveStreamRecorder && liveStreamRecorder.state !== 'inactive') {
    liveStreamRecorder.stop();
  }
  if (wsRelay && wsRelay.readyState === WebSocket.OPEN) {
    wsRelay.close(1000, 'Session stopped');
  }

  // Handle termination based on mode
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop(); // Triggers file compilation and save dialog
  } else {
    // YouTube Only Mode: no file to save, close cleanly
    statusMessage.textContent = 'Stream stopped successfully.';
    closeBtn.style.display = 'block';
    cleanup();
    chrome.storage.local.set({ isRecording: false, recorderWindowId: null });
    setTimeout(() => {
      window.close();
    }, 1500);
  }
});

function renderMeters() {
  const drawBar = (ctx, analyser, isMuted) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (isMuted) {
      ctx.fillStyle = '#22222a';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const width = Math.min(w, (avg / 128) * w);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#34a853');
    grad.addColorStop(0.7, '#fbbc04');
    grad.addColorStop(1, '#ea4335');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, h);
  };

  drawBar(micCtx, micAnalyser, isMicMuted);
  drawBar(tabCtx, tabAnalyser, isTabMuted);

  animFrameId = requestAnimationFrame(renderMeters);
}

function cleanup() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (wsRelay) {
    try { wsRelay.close(); } catch (e) {}
    wsRelay = null;
  }
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