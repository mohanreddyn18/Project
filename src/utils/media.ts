export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      resolve({
        base64,
        mimeType: file.type || 'application/octet-stream',
        dataUrl,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export async function urlToBase64(
  url: string,
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load sample asset (${response.status}).`);
  }
  const blob = await response.blob();
  const file = new File([blob], 'sample', { type: blob.type || 'image/jpeg' });
  return fileToBase64(file);
}

export function captureVideoFrame(video: HTMLVideoElement): {
  base64: string;
  mimeType: string;
  dataUrl: string;
} {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }
  ctx.drawImage(video, 0, 0, targetW, targetH);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const commaIdx = dataUrl.indexOf(',');
  return {
    base64: dataUrl.slice(commaIdx + 1),
    mimeType: 'image/jpeg',
    dataUrl,
  };
}

export async function seekAndCaptureFrame(
  video: HTMLVideoElement,
  timeSeconds: number,
): Promise<{ base64: string; mimeType: string; dataUrl: string; timestamp: number }> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      try {
        const frame = captureVideoFrame(video);
        resolve({ ...frame, timestamp: timeSeconds });
      } catch (err) {
        reject(err);
      }
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Failed to seek video frame.'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = timeSeconds;
  });
}
