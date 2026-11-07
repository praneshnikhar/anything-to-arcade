import type { GenerationView } from "@/lib/generation/state";
import type { ScenePlan } from "@/lib/planner/schema";

export class ApiError extends Error {}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // ignore
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (HTTP ${response.status})`;
    throw new ApiError(message);
  }
  return body as T;
}

export async function postPlan(
  file: File,
): Promise<{ generationId: string; plan: ScenePlan }> {
  const form = new FormData();
  form.set("image", file);
  return parse(await fetch("/api/plan", { method: "POST", body: form }));
}

export async function postBuild(generationId: string): Promise<{ ok: true }> {
  return parse(
    await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generationId }),
    }),
  );
}

export async function getGeneration(id: string): Promise<GenerationView> {
  return parse(await fetch(`/api/generations/${id}`, { cache: "no-store" }));
}

export async function postRegenerate(
  generationId: string,
  slotId: string,
): Promise<{ ok: true }> {
  return parse(
    await fetch("/api/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generationId, slotId }),
    }),
  );
}

export interface GalleryItem {
  id: string;
  genre: string;
  status: string;
  createdAt: number;
  imageUrl: string;
  thumbUrl: string;
}

export async function getGallery(): Promise<{ items: GalleryItem[] }> {
  return parse(await fetch("/api/gallery", { cache: "no-store" }));
}
