/** Crop toward a page/label, enlarge, and sharpen so Gemini can read text. */

const TARGET_LONG_SIDE = 1600;
const MAX_LONG_SIDE = 1920;

type Box = { x: number; y: number; w: number; h: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Bounding box of high-edge, paper-like pixels. */
export function findDocumentBox(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Box | null {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  const samples: number[] = [];
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = (y * width + x) * 4;
      samples.push(luma(pixels[i], pixels[i + 1], pixels[i + 2]));
    }
  }
  if (samples.length < 20) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length * 0.45)] ?? 128;
  const paperFloor = mid * 0.78;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let hits = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = (y * width + x) * 4;
      const c = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
      const left = luma(
        pixels[i - 4],
        pixels[i - 3],
        pixels[i - 2]
      );
      const up = luma(
        pixels[i - width * 4],
        pixels[i - width * 4 + 1],
        pixels[i - width * 4 + 2]
      );
      const edge = Math.abs(c - left) + Math.abs(c - up);
      if (c >= paperFloor && edge > 14) {
        hits += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (hits < 12) return null;

  const padX = Math.round((maxX - minX) * 0.08) + 8;
  const padY = Math.round((maxY - minY) * 0.08) + 8;
  const x = clamp(minX - padX, 0, width - 1);
  const y = clamp(minY - padY, 0, height - 1);
  const w = clamp(maxX + padX - x, 32, width - x);
  const h = clamp(maxY + padY - y, 32, height - y);
  const area = (w * h) / (width * height);
  if (area < 0.18 || area > 0.94) return null;
  return { x, y, w, h };
}

function boxBlur(
  src: Uint8ClampedArray,
  dest: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const radius = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = clamp(x + dx, 0, width - 1);
          const i = (yy * width + xx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n += 1;
        }
      }
      const o = (y * width + x) * 4;
      dest[o] = r / n;
      dest[o + 1] = g / n;
      dest[o + 2] = b / n;
      dest[o + 3] = src[o + 3];
    }
  }
}

function sharpenAndStretch(image: ImageData): void {
  const { data, width, height } = image;
  const blur = new Uint8ClampedArray(data.length);
  boxBlur(data, blur, width, height);

  const lumas: number[] = [];
  const step = Math.max(1, Math.floor((width * height) / 8000));
  for (let i = 0; i < data.length; i += 4 * step) {
    lumas.push(luma(data[i], data[i + 1], data[i + 2]));
  }
  lumas.sort((a, b) => a - b);
  const lo = lumas[Math.floor(lumas.length * 0.03)] ?? 0;
  const hi = lumas[Math.floor(lumas.length * 0.97)] ?? 255;
  const span = Math.max(28, hi - lo);
  const amount = 1.35;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const sharp = data[i + c] + amount * (data[i + c] - blur[i + c]);
      const stretched = ((sharp - lo) / span) * 255;
      data[i + c] = clamp(stretched, 0, 255);
    }
  }
}

function copyBox(
  source: HTMLCanvasElement,
  box: Box | null
): HTMLCanvasElement {
  const sx = box?.x ?? 0;
  const sy = box?.y ?? 0;
  const sw = box?.w ?? source.width;
  const sh = box?.h ?? source.height;
  const long = Math.max(sw, sh);
  let scale = long < TARGET_LONG_SIDE ? TARGET_LONG_SIDE / long : 1;
  if (long * scale > MAX_LONG_SIDE) scale = MAX_LONG_SIDE / long;

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

/** Mutates a video-frame canvas into a cropped, enlarged, sharpened still. */
export function enhanceDocumentCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d");
  if (!ctx || source.width < 8 || source.height < 8) return source;

  const probe = ctx.getImageData(0, 0, source.width, source.height);
  const box = findDocumentBox(probe.data, source.width, source.height);
  const enlarged = copyBox(source, box);
  const outCtx = enlarged.getContext("2d");
  if (!outCtx) return enlarged;
  const pixels = outCtx.getImageData(0, 0, enlarged.width, enlarged.height);
  sharpenAndStretch(pixels);
  outCtx.putImageData(pixels, 0, 0);
  return enlarged;
}
