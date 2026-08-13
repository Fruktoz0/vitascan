const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('A kép nem olvasható.'));
    };
    img.src = url;
  });
}

function canvasToJpegBase64(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('A kép tömörítése sikertelen.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const match = result.match(/^data:[^;]+;base64,(.+)$/);
          if (!match) {
            reject(new Error('Invalid image data'));
            return;
          }
          resolve(match[1]);
        };
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Resize + JPEG so phone photos fit through /api proxy (avoids 502 HTML / hang). */
export async function fileToCompressedJpeg(
  file: File,
): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('A kép mérete érvénytelen.');

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A kép nem dolgozható fel ezen az eszközön.');
  ctx.drawImage(img, 0, 0, tw, th);

  let quality = JPEG_QUALITY;
  let base64 = await canvasToJpegBase64(canvas, quality);
  // Keep JSON payload well under typical 1–12 MB proxy/body limits.
  while (base64.length > 1_200_000 && quality > 0.5) {
    quality -= 0.1;
    base64 = await canvasToJpegBase64(canvas, quality);
  }
  return { base64, mimeType: 'image/jpeg' };
}

export async function fileToCompressedJpegFile(file: File, filename = 'photo.jpg'): Promise<File> {
  const { base64, mimeType } = await fileToCompressedJpeg(file);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mimeType });
}
