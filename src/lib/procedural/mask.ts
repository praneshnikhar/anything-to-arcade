import sharp from "sharp";

export interface Mask {
  data: Uint8ClampedArray; // 255 = foreground, 0 = background
  width: number;
  height: number;
}

/**
 * Turns an entity crop into a binary foreground mask by flood-filling the
 * background from the image borders (the corner color is the background).
 * Robust for the common case — a subject on a fairly uniform backdrop.
 */
export async function maskFromBuffer(
  buffer: Buffer,
  sampleSize = 48,
): Promise<Mask> {
  const { data, info } = await sharp(buffer)
    .resize(sampleSize, sampleSize, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const cornerPositions = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let cornerR = 0;
  let cornerG = 0;
  let cornerB = 0;
  for (const [cx, cy] of cornerPositions) {
    const offset = (cy * width + cx) * channels;
    cornerR += data[offset];
    cornerG += data[offset + 1];
    cornerB += data[offset + 2];
  }
  cornerR /= cornerPositions.length;
  cornerG /= cornerPositions.length;
  cornerB /= cornerPositions.length;

  const THRESHOLD = 40;
  const isBackground = (offset: number): boolean => {
    const dr = data[offset] - cornerR;
    const dg = data[offset + 1] - cornerG;
    const db = data[offset + 2] - cornerB;
    return dr * dr + dg * dg + db * db < THRESHOLD * THRESHOLD;
  };

  const background = new Uint8Array(width * height);
  const queue: number[] = [];

  const tryMark = (x: number, y: number) => {
    const pixel = y * width + x;
    if (background[pixel]) return;
    if (!isBackground(pixel * channels)) return;
    background[pixel] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x += 1) {
    tryMark(x, 0);
    tryMark(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryMark(0, y);
    tryMark(width - 1, y);
  }

  while (queue.length > 0) {
    const y = queue.pop() as number;
    const x = queue.pop() as number;
    if (x > 0) tryMark(x - 1, y);
    if (x < width - 1) tryMark(x + 1, y);
    if (y > 0) tryMark(x, y - 1);
    if (y < height - 1) tryMark(x, y + 1);
  }

  const fg = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * channels;
    const alpha = channels >= 4 ? data[offset + 3] : 255;
    if (!background[pixel] && alpha > 40) {
      fg[pixel] = 255;
    }
  }

  return { data: fg, width, height };
}
