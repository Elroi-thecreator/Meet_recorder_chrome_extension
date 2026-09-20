const requestBtn = document.getElementById('requestBtn');

requestBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    requestBtn.textContent = 'Permission Granted! Closing...';
    requestBtn.style.background = '#0f9d58';

    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (err) {
    alert('Microphone permission was denied. Please allow microphone access in site permissions.');
  }
});