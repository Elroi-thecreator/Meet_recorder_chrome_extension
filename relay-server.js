const { createServer } = require('http');
const { parse } = require('url');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Meet Recorder RTMP Relay Server is running.\n');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = parse(request.url);

  if (pathname === '/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url, true);
  const streamKey = query.key;

  if (!streamKey) {
    console.warn('[Relay] Connection rejected: Missing YouTube stream key.');
    ws.close(1008, 'Stream key required');
    return;
  }

  const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
  console.log(`[Relay] New client connected. Forwarding stream to YouTube RTMP...`);

  // Spawn ffmpeg to transcode/repackage WebM (Opus) -> FLV (AAC) for RTMP
  const ffmpegArgs = [
    '-i', '-',                          // Read incoming WebM chunks from stdin
    '-c:v', 'copy',                     // Direct passthrough for video (low CPU)
    '-c:a', 'aac',                      // RTMP requires AAC audio
    '-b:a', '128k',                     // 128k AAC audio bitrate
    '-ar', '44100',                     // Standard RTMP sample rate
    '-f', 'flv',                        // YouTube RTMP container format
    rtmpUrl
  ];

  const { existsSync } = require('fs');
  const getFFmpegPath = () => {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
    const fallback = 'C:\\Program Files\\Streamlabs OBS\\resources\\node_modules\\ffmpeg-ffprobe-static\\ffmpeg.exe';
    if (existsSync(fallback)) return fallback;
    return 'ffmpeg';
  };

  const ffmpegProcess = spawn(getFFmpegPath(), ffmpegArgs);

  ffmpegProcess.stderr.on('data', (data) => {
    // Uncomment for debugging FFmpeg stream status:
    // console.log(`[FFmpeg] ${data.toString()}`);
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[FFmpeg Process Error]', err);
    ws.close(1011, 'FFmpeg execution error');
  });

  ffmpegProcess.on('close', (code, signal) => {
    console.log(`[FFmpeg] Closed with code ${code}, signal ${signal}`);
  });

  // Pipe binary ArrayBuffers directly into FFmpeg stdin
  ws.on('message', (chunk, isBinary) => {
    if (isBinary && ffmpegProcess.stdin.writable) {
      ffmpegProcess.stdin.write(chunk);
    }
  });

  ws.on('close', () => {
    console.log('[Relay] Client disconnected. Closing FFmpeg stream...');
    if (ffmpegProcess.stdin.writable) {
      ffmpegProcess.stdin.end();
    }
    ffmpegProcess.kill('SIGINT');
  });

  ws.on('error', (err) => {
    console.error('[WebSocket Client Error]', err);
    if (ffmpegProcess.stdin.writable) {
      ffmpegProcess.stdin.end();
    }
    ffmpegProcess.kill('SIGINT');
  });
});

server.listen(PORT, () => {
  console.log(`[Relay Server] Listening on port ${PORT}`);
  console.log(`[Relay Server] WebSocket endpoint: ws://localhost:${PORT}/live`);
});