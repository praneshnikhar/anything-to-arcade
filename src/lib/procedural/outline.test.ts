import { describe, expect, it } from "vitest";
import { convexHull, traceOutline } from "./outline";

function filledSquare(width: number, height: number): Uint8ClampedArray {
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 4; y < 12; y += 1) {
    for (let x = 4; x < 12; x += 1) {
      mask[y * width + x] = 255;
    }
  }
  return mask;
}

describe("traceOutline", () => {
  it("returns a 4-corner hull for a filled square", () => {
    const hull = traceOutline(filledSquare(16, 16), 16, 16);

    expect(hull).toHaveLength(4);
  });

  it("returns an empty outline for a blank mask", () => {
    expect(traceOutline(new Uint8ClampedArray(64), 8, 8)).toEqual([]);
  });
});

describe("convexHull", () => {
  it("hulls four points into the same four corners", () => {
    const hull = convexHull([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);

    expect(hull).toHaveLength(4);
  });

  it("is a no-op for fewer than three points", () => {
    expect(convexHull([[0, 0]])).toEqual([[0, 0]]);
  });
});
