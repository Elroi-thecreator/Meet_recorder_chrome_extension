import os
import sys
import asyncio
import urllib.parse
from http import HTTPStatus
import websockets

import shutil

PORT = int(os.environ.get("PORT", 8080))

def get_ffmpeg_path():
    if os.environ.get("FFMPEG_PATH"):
        return os.environ.get("FFMPEG_PATH")
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    fallback = r"C:\Program Files\Streamlabs OBS\resources\node_modules\ffmpeg-ffprobe-static\ffmpeg.exe"
    if os.path.exists(fallback):
        return fallback
    return "ffmpeg"

async def handle_client(websocket):
    parsed = urllib.parse.urlparse(websocket.request.path)
    if parsed.path != "/live":
        await websocket.close(1008, "Invalid endpoint. Use /live")
        return

    query = urllib.parse.parse_qs(parsed.query)
    stream_keys = query.get("key", [])
    if not stream_keys or not stream_keys[0]:
        print("[Relay] Connection rejected: Missing YouTube stream key.", flush=True)
        await websocket.close(1008, "Stream key required")
        return

    stream_key = stream_keys[0]
    rtmp_url = f"rtmp://a.rtmp.youtube.com/live2/{stream_key}"
    print(f"[Relay] New client connected. Forwarding stream to YouTube RTMP...", flush=True)

    ffmpeg_bin = get_ffmpeg_path()
    ffmpeg_args = [
        ffmpeg_bin,
        "-i", "-",               # Read incoming WebM chunks from stdin
        "-c:v", "copy",          # Passthrough video
        "-c:a", "aac",           # Transcode audio to AAC
        "-b:a", "128k",
        "-ar", "44100",
        "-f", "flv",             # Container format for YouTube RTMP
        rtmp_url
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL
        )
    except Exception as e:
        print(f"[Relay] Failed to start FFmpeg: {e}", flush=True)
        await websocket.close(1011, "FFmpeg execution error")
        return

    try:
        async for message in websocket:
            if isinstance(message, bytes) and process.stdin:
                try:
                    process.stdin.write(message)
                    await process.stdin.drain()
                except Exception as write_err:
                    print(f"[Relay] Error writing to FFmpeg: {write_err}", flush=True)
                    break
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print("[Relay] Client disconnected. Closing FFmpeg stream...", flush=True)
        if process.stdin:
            try:
                process.stdin.close()
                await process.stdin.wait_closed()
            except Exception:
                pass
        try:
            process.terminate()
            await process.wait()
        except Exception:
            pass

async def process_request(connection, request):
    parsed = urllib.parse.urlparse(request.path)
    if parsed.path != "/live":
        # Return plain HTTP response for root or status checks
        return connection.respond(
            HTTPStatus.OK,
            "Meet Recorder RTMP Relay Server is running.\n"
        )
    return None

async def main():
    print(f"[Relay Server] Listening on port {PORT}", flush=True)
    print(f"[Relay Server] WebSocket endpoint: ws://localhost:{PORT}/live", flush=True)
    async with websockets.serve(
        handle_client,
        "0.0.0.0",
        PORT,
        process_request=process_request
    ):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Relay Server] Stopped.", flush=True)
