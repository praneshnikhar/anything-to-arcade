import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropEntity, normalizeImage, validateUpload } from "./images";

describe("validateUpload", () => {
  it("rejects unsupported pdf uploads", () => {
    expect(validateUpload({ mime: "application/pdf", size: 1000 })).toEqual({
      ok: false,
      reason: expect.stringContaining("Unsupported"),
    });
  });

  it("rejects files over 10MB", () => {
    expect(validateUpload({ mime: "image/png", size: 10_000_001 })).toEqual({
      ok: false,
      reason: expect.stringContaining("10 MB"),
    });
  });

  it("rejects zero-byte files", () => {
    expect(validateUpload({ mime: "image/png", size: 0 })).toEqual({
      ok: false,
      reason: expect.stringContaining("empty"),
    });
  });

  it("accepts a normal png", () => {
    expect(validateUpload({ mime: "image/png", size: 1024 })).toEqual({
      ok: true,
    });
  });
});

describe("normalizeImage", () => {
  it("normalizes a 3200x600 png to <=1600px wide jpeg", async () => {
    const png = await sharp({
      create: {
        width: 3200,
        height: 600,
        channels: 3,
        background: "#aabbcc",
      },
    })
      .png()
      .toBuffer();

    const jpg = await normalizeImage(png);
    const meta = await sharp(jpg).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.width).toBe(1600);
  });
});

describe("cropEntity", () => {
  it("crops out a centered bbox", async () => {
    const png = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    const crop = await cropEntity(png, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    const meta = await sharp(crop).metadata();

    // 10% padding expands the 50×50 center to ~55×55.
    expect(meta.width).toBeGreaterThan(50);
    expect(meta.width).toBeLessThanOrEqual(60);
    expect(meta.height).toBeGreaterThan(50);
    expect(meta.height).toBeLessThanOrEqual(60);
  });

  it("enforces a 32px minimum side", async () => {
    const png = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    const crop = await cropEntity(png, { x: 0, y: 0, w: 0.01, h: 0.01 });
    const meta = await sharp(crop).metadata();

    expect(meta.width).toBeGreaterThanOrEqual(32);
    expect(meta.height).toBeGreaterThanOrEqual(32);
  });
});
