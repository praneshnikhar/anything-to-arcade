import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  errorJson,
  getServices,
  serviceErrorResponse,
} from "@/lib/api";


const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  const { path: segments } = await context.params;
  if (
    !segments ||
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.includes("..") ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    return errorJson("Not found.", 404);
  }

  const base = path.resolve(services.dataDir);
  const filePath = path.resolve(base, ...segments);
  if (filePath !== base && !filePath.startsWith(`${base}${path.sep}`)) {
    return errorJson("Not found.", 404);
  }

  try {
    const data = await readFile(filePath);
    const contentType =
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream";
    const headers: Record<string, string> = { "Content-Type": contentType };
    if (contentType === "model/gltf-binary") {
      // Regeneration overwrites the same path — never serve a stale GLB.
      headers["Cache-Control"] = "no-store";
    } else {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return errorJson("Not found.", 404);
  }
}
