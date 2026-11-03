import { describe, expect, it } from "vitest";
import { createTripoClient } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createTripoClient", () => {
  it("uploads multipart and returns a file token", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ code: 0, data: { image_token: "ft_1" } });
    }) as typeof fetch;

    const client = createTripoClient({ apiKey: "k", fetchImpl: fake });

    await expect(
      client.uploadImage(Buffer.from("x"), "a.png"),
    ).resolves.toEqual({ fileToken: "ft_1" });
    expect(calls[0].url).toBe("https://api.tripo3d.ai/v2/openapi/upload");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeInstanceOf(FormData);
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer k");
  });

  it("creates an image_to_model task with the uploaded token", async () => {
    let sent: Record<string, unknown> | undefined;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return jsonResponse({ code: 0, data: { task_id: "t1" } });
    }) as typeof fetch;

    const client = createTripoClient({ apiKey: "k", fetchImpl: fake });

    await expect(
      client.createImageToModelTask({
        fileToken: "ft_1",
        faceLimit: 10000,
        modelVersion: "v2.5-20250123",
      }),
    ).resolves.toEqual({ taskId: "t1" });

    expect(sent).toMatchObject({
      type: "image_to_model",
      model_version: "v2.5-20250123",
      face_limit: 10000,
      file: { type: "jpg", file_token: "ft_1" },
    });
  });

  it("maps a successful task to a model url", async () => {
    const fake = (async () =>
      jsonResponse({
        code: 0,
        data: {
          task_id: "t1",
          status: "success",
          progress: 100,
          output: {
            model: "https://cdn.example/m.glb",
            pbr_model: "https://cdn.example/p.glb",
          },
        },
      })) as unknown as typeof fetch;

    const client = createTripoClient({ apiKey: "k", fetchImpl: fake });

    await expect(client.getTask("t1")).resolves.toEqual({
      taskId: "t1",
      status: "success",
      progress: 100,
      modelUrl: "https://cdn.example/m.glb",
    });
  });

  it("maps a failed task and surfaces its error", async () => {
    const fake = (async () =>
      jsonResponse({
        code: 0,
        data: {
          task_id: "t1",
          status: "failed",
          progress: 40,
          error: "boom",
        },
      })) as unknown as typeof fetch;

    const client = createTripoClient({ apiKey: "k", fetchImpl: fake });

    await expect(client.getTask("t1")).resolves.toEqual({
      taskId: "t1",
      status: "failed",
      progress: 40,
      error: "boom",
    });
  });

  it("throws on non-zero code with the API message", async () => {
    const fake = (async () =>
      jsonResponse({ code: 1002, message: "bad token" })) as unknown as typeof fetch;

    const client = createTripoClient({ apiKey: "k", fetchImpl: fake });

    await expect(client.getTask("t1")).rejects.toThrow(/bad token/);
  });
});
