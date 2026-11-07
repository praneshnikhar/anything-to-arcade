/**
 * Trace the outline of a binary foreground mask as a convex polygon
 * (monotone chain). A convex "sticker" cutout is the right primitive for a
 * cartoon/arcade fallback and is simple and robust to triangulate.
 */
export function traceOutline(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): number[][] {
  const points: number[][] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] >= 128) {
        points.push([x, y]);
      }
    }
  }
  if (points.length < 3) return [];

  return convexHull(points);
}

function cross(o: number[], a: number[], b: number[]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points: number[][]): number[][] {
  const sorted = [...points].sort((a, b) =>
    a[0] === b[0] ? a[1] - b[1] : a[0] - b[0],
  );
  if (sorted.length < 3) return sorted;

  const lower: number[][] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: number[][] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
