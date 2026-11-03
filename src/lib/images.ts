import sharp from "sharp";

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 10_000_000;
const MIN_SIDE = 32;

export type UploadCheck = { ok: true } | { ok: false; reason: string };

export function validateUpload(input: {
  mime: string;
  size: number;
}): UploadCheck {
  if (input.size <= 0) {
    return { ok: false, reason: "File is empty." };
  }
  if (!ALLOWED_MIMES.has(input.mime)) {
    return {
      ok: false,
      reason: `Unsupported file type: ${input.mime}. Use PNG, JPEG, WebP, or GIF.`,
    };
  }
  if (input.size > MAX_BYTES) {
    return { ok: false, reason: "File is larger than 10 MB." };
  }
  return { ok: true };
}

export async function normalizeImage(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { animated: false })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export async function cropEntity(
  buf: Buffer,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const imageWidth = meta.width ?? 1;
  const imageHeight = meta.height ?? 1;

  const x = clamp01(bbox.x);
  const y = clamp01(bbox.y);
  const w = clamp01(bbox.w);
  const h = clamp01(bbox.h);

  let left = Math.min(Math.round(x * imageWidth), imageWidth - MIN_SIDE);
  let top = Math.min(Math.round(y * imageHeight), imageHeight - MIN_SIDE);
  left = Math.max(0, left);
  top = Math.max(0, top);

  const width = Math.max(
    MIN_SIDE,
    Math.min(Math.round(w * imageWidth), imageWidth - left),
  );
  const height = Math.max(
    MIN_SIDE,
    Math.min(Math.round(h * imageHeight), imageHeight - top),
  );

  return sharp(buf)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();
}
