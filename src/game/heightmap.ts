export function extractHeightmap(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  samples = 32,
): number[] {
  const sampleCount = Math.max(1, Math.floor(samples));

  if (width <= 0 || height <= 0 || gray.length < width * height) {
    return new Array(sampleCount).fill(0.5);
  }

  const raw: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const x = Math.min(
      width - 1,
      Math.floor(((index + 0.5) / sampleCount) * width),
    );

    if (height === 1) {
      raw.push(0.5);
      continue;
    }

    let bestY = -1;
    let bestGradient = -1;

    for (let y = 1; y < height; y += 1) {
      const gradient = Math.abs(
        gray[y * width + x] - gray[(y - 1) * width + x],
      );
      if (gradient > bestGradient) {
        bestGradient = gradient;
        bestY = y;
      }
    }

    if (bestGradient < 8 || bestY < 0) {
      raw.push(0.5);
      continue;
    }

    const value = 1 - bestY / height;
    raw.push(Math.min(1, Math.max(0, value)));
  }

  // Median smoothing over a 3-sample window keeps the profile stable.
  return raw.map((value, index) => {
    const window = [
      raw[Math.max(0, index - 1)],
      value,
      raw[Math.min(raw.length - 1, index + 1)],
    ].sort((a, b) => a - b);
    return window[1];
  });
}
