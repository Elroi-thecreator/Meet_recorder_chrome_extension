// Minimal EBML duration patcher for Chrome WebM output
window.patchWebmDuration = async function(blob, durationMs) {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  
  // Locate Segment Info Element ID [0x15, 0x49, 0xA9, 0x66]
  let pos = -1;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(bytes.length - 4, 1024); i++) {
    if (bytes[i] === 0x15 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0xA9 && bytes[i + 3] === 0x66) {
      pos = i;
      break;
    }
  }

  if (pos === -1) return blob; // Fallback to raw if header not matched

  // Look for existing Duration element [0x44, 0x89] inside Info block
  for (let i = pos; i < pos + 256 && i < bytes.length - 6; i++) {
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89) {
      // Overwrite 4-byte or 8-byte float
      const size = bytes[i + 2];
      if (size === 4) {
        view.setFloat32(i + 3, durationMs);
        return new Blob([buffer], { type: 'video/webm' });
      } else if (size === 8) {
        view.setFloat64(i + 3, durationMs);
        return new Blob([buffer], { type: 'video/webm' });
      }
    }
  }

  return blob;
};