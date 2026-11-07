import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { maskFromBuffer } from "./mask";

async function circleOnWhite(): Promise<Buffer> {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">' +
      '<rect width="48" height="48" fill="#ffffff"/>' +
      '<circle cx="24" cy="24" r="14" fill="#111111"/></svg>',
  );
  return sharp({
    create: { width: 48, height: 48, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: svg }])
    .png()
    .toBuffer();
}

describe("maskFromBuffer", () => {
  it("separates a dark subject from a light background", async () => {
    const mask = await maskFromBuffer(await circleOnWhite());

    expect(mask.width).toBe(48);
    expect(mask.height).toBe(48);
    // Corners are background.
    expect(mask.data[0]).toBe(0);
    expect(mask.data[47]).toBe(0);
    expect(mask.data[47 * 48]).toBe(0);
    expect(mask.data[47 * 48 + 47]).toBe(0);
    // Center is foreground.
    expect(mask.data[24 * 48 + 24]).toBe(255);
  });
});
