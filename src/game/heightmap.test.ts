import { describe, expect, it } from "vitest";
import { extractHeightmap } from "./heightmap";

function fixture(
  width: number,
  height: number,
  boundaryAt: (x: number) => number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = y < boundaryAt(x) ? 255 : 0;
    }
  }
  return data;
}

describe("extractHeightmap", () => {
  it("maps a flat horizon to a flat profile", () => {
    const heights = extractHeightmap(fixture(100, 100, () => 50), 100, 100, 32);

    expect(heights).toHaveLength(32);
    for (const value of heights) {
      expect(value).toBeGreaterThan(0.4);
      expect(value).toBeLessThan(0.6);
    }
  });

  it("follows a sloping horizon", () => {
    const heights = extractHeightmap(
      fixture(100, 100, (x) => 20 + (x / 99) * 60),
      100,
      100,
      32,
    );

    expect(heights[0]).toBeGreaterThan(0.6);
    expect(heights[31]).toBeLessThan(0.4);
    expect(heights[0]).toBeGreaterThan(heights[31]);
  });

  it("falls back to a mid profile for featureless images", () => {
    const gray = new Uint8ClampedArray(100 * 100).fill(128);
    const heights = extractHeightmap(gray, 100, 100, 16);

    expect(heights).toHaveLength(16);
    expect(heights.every((value) => value === 0.5)).toBe(true);
  });

  it("clamps output to 0..1 and handles tiny inputs", () => {
    const heights = extractHeightmap(new Uint8ClampedArray([0, 255]), 2, 1, 8);

    expect(heights).toHaveLength(8);
    expect(heights.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
