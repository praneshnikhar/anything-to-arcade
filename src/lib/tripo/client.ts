import type { TripoClient, TripoTask, TripoTaskStatus } from "./types";

const DEFAULT_BASE_URL = "https://api.tripo3d.ai/v2/openapi";
const STATUSES: readonly TripoTaskStatus[] = [
  "queued",
  "running",
  "success",
  "failed",
  "banned",
  "expired",
  "cancelled",
  "unknown",
];

interface TaskResponse {
  task_id?: string;
  id?: string;
  status?: string;
  progress?: number;
  output?: {
    model?: string;
    pbr_model?: string;
    base_model?: string;
  };
  error?: string | { message?: string };
}

export function createTripoClient(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): TripoClient {
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await doFetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    });

    let body: { code?: number; message?: string; data?: T };
    try {
      body = await response.json();
    } catch {
      throw new Error(
        `Tripo API ${path} returned non-JSON (HTTP ${response.status})`,
      );
    }

    if (!response.ok || body.code !== 0) {
      throw new Error(
        body.message || `Tripo API ${path} failed with HTTP ${response.status}`,
      );
    }

    return body.data as T;
  }

  return {
    async uploadImage(buf: Buffer, filename: string) {
      const form = new FormData();
      const mime =
        filename.endsWith(".webp")
          ? "image/webp"
          : filename.endsWith(".png")
            ? "image/png"
            : "image/jpeg";
      form.set("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);

      const data = await request<{ image_token: string }>("/upload", {
        method: "POST",
        body: form,
      });
      return { fileToken: data.image_token };
    },

    async createImageToModelTask(input) {
      const data = await request<{ task_id: string }>("/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "image_to_model",
          model_version: input.modelVersion,
          face_limit: input.faceLimit,
          texture: true,
          pbr: true,
          auto_size: true,
          orientation: "align_image",
          enable_image_autofix: true,
          texture_alignment: "original_image",
          ...(input.smartLowPoly ? { smart_low_poly: true } : {}),
          file: { type: input.fileType ?? "jpg", file_token: input.fileToken },
        }),
      });
      return { taskId: data.task_id };
    },

    async getTask(taskId) {
      const data = await request<TaskResponse>(
        `/task/${encodeURIComponent(taskId)}`,
      );

      const status = STATUSES.includes(data.status as TripoTaskStatus)
        ? (data.status as TripoTaskStatus)
        : "unknown";
      const error =
        typeof data.error === "string" ? data.error : data.error?.message;

      const task: TripoTask = {
        taskId: data.task_id ?? data.id ?? taskId,
        status,
        progress: typeof data.progress === "number" ? data.progress : 0,
      };
      if (data.output?.model) task.modelUrl = data.output.model;
      else if (data.output?.pbr_model) task.modelUrl = data.output.pbr_model;
      else if (data.output?.base_model) task.modelUrl = data.output.base_model;
      if (error) task.error = error;

      return task;
    },
  };
}
