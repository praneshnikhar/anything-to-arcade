import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateMesh } from "./generator";

async function ballCrop(): Promise<Buffer> {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" fill="#d8f3dc"/>' +
      '<circle cx="32" cy="32" r="20" fill="#1b3a2a"/></svg>',
  );
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#d8f3dc" },
  })
    .composite([{ input: svg }])
    .png()
    .toBuffer();
  return sharp(png).jpeg().toBuffer();
}

describe("generateMesh", () => {
  it("produces a binary glTF buffer from an entity crop", async () => {
    const glb = await generateMesh(await ballCrop(), {
      role: "ball",
      palette: ["#dc2626", "#4d7c0f", "#eab308", "#0f172a"],
    });

    expect(Buffer.isBuffer(glb)).toBe(true);
    expect(glb.length).toBeGreaterThan(100);
    expect(glb.subarray(0, 4).toString("ascii")).toBe("glTF");
  });

  it("falls back to a card for a blank crop", async () => {
    const blank = await sharp({
      create: { width: 48, height: 48, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();

    const glb = await generateMesh(blank, {
      role: "scenery",
      palette: ["#dc2626", "#4d7c0f", "#eab308", "#0f172a"],
    });

    expect(glb.subarray(0, 4).toString("ascii")).toBe("glTF");
  });
});
