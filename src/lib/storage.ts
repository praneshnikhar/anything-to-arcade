import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function safeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "x";
}

export async function saveUpload(
  dataDir: string,
  id: string,
  buf: Buffer,
): Promise<string> {
  const dir = path.join(dataDir, "uploads");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safeSegment(id)}.jpg`);
  await writeFile(filePath, buf);
  return filePath;
}

export async function saveGeneratedGlb(
  dataDir: string,
  genId: string,
  slotId: string,
  buf: Buffer,
): Promise<string> {
  const dir = path.join(dataDir, "generated", safeSegment(genId));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${safeSegment(slotId)}.glb`);
  await writeFile(filePath, buf);
  return filePath;
}

export function assetUrl(genId: string, slotId: string): string {
  return `/api/files/generated/${safeSegment(genId)}/${safeSegment(slotId)}.glb`;
}

export function uploadUrl(id: string): string {
  return `/api/files/uploads/${safeSegment(id)}.jpg`;
}
