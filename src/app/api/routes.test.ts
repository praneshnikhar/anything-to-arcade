import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import type { Services } from "@/lib/api";
import { setServicesForTests } from "@/lib/api";
import { openDb } from "@/lib/db";
import { insertAsset, insertGeneration } from "@/lib/generations";
import type { ScenePlan } from "@/lib/planner/schema";
import type { TripoClient } from "@/lib/tripo/types";

const PLAN_FIXTURE: ScenePlan = {
  sceneType: "hills",
  chosenGenre: "hill_climb",
  genreReason: "hills",
  confidence: 0.9,
  entities: [
    {
      slotId: "vehicle",
      label: "car",
      role: "vehicle",
      bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      useForGeneration: true,
    },
  ],
  palette: ["#ffffff"],
};

function makeTripo(): TripoClient {
  return {
    uploadImage: async () => ({ fileToken: "ft" }),
    createImageToModelTask: async () => ({ taskId: "t1" }),
    getTask: async () => ({
      taskId: "t1",
      status: "running",
      progress: 0,
    }),
  };
}

async function makeServices(): Promise<Services> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "ata-api-"));
  const db = openDb(dataDir);
  const services: Services = {
    db,
    tripo: makeTripo(),
    dataDir,
    env: {
      tripoApiKey: "k",
      geminiApiKey: "g",
      tripoModelVersion: "v2.5-20250123",
      geminiModel: "gemini-flash-lite-latest",
      dataDir,
    },
    planImage: async () => PLAN_FIXTURE,
  };
  setServicesForTests(services);
  return services;
}

async function seedGeneration(services: Services, id = "gen1") {
  mkdirSync(path.join(services.dataDir, "uploads"), { recursive: true });
  const jpg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#abc" },
  })
    .jpeg()
    .toBuffer();
  writeFileSync(
    path.join(services.dataDir, "uploads", `${id}.jpg`),
    jpg,
  );
  insertGeneration(services.db, {
    id,
    imagePath: path.join(services.dataDir, "uploads", `${id}.jpg`),
    imageHash: `hash-${id}`,
    planJson: JSON.stringify(PLAN_FIXTURE),
    genre: "hill_climb",
    status: "planned",
  });
}

async function makeImageFile(mime = "image/png"): Promise<File> {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#abc" },
  })
    .png()
    .toBuffer();
  return new File([png], "scene.png", { type: mime });
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setServicesForTests(null);
});

describe("POST /api/plan", () => {
  it("rejects a PDF with 400", async () => {
    await makeServices();
    const { POST } = await import("./plan/route");
    const form = new FormData();
    form.set(
      "image",
      new File([Buffer.from("%PDF")], "x.pdf", {
        type: "application/pdf",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/plan", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Unsupported");
  });

  it("rejects an oversized upload with 413", async () => {
    await makeServices();
    const { POST } = await import("./plan/route");
    const form = new FormData();
    form.set(
      "image",
      new File([Buffer.alloc(10_000_001)], "big.png", {
        type: "image/png",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/plan", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(413);
  });

  it("returns 503 when keys are missing", async () => {
    const { POST } = await import("./plan/route");
    const form = new FormData();
    form.set("image", await makeImageFile());

    const response = await POST(
      new Request("http://localhost/api/plan", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("TRIPO_API_KEY");
  });

  it("stores the generation and returns the plan", async () => {
    const services = await makeServices();
    const { POST } = await import("./plan/route");
    const form = new FormData();
    form.set("image", await makeImageFile());

    const response = await POST(
      new Request("http://localhost/api/plan", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.chosenGenre).toBe("hill_climb");
    expect(body.generationId).toMatch(/^gen_/);
    const { getGeneration } = await import("@/lib/generations");
    expect(getGeneration(services.db, body.generationId)?.status).toBe(
      "planned",
    );
  });
});

describe("POST /api/build", () => {
  it("rejects an unknown generation id with 404", async () => {
    await makeServices();
    const { POST } = await import("./build/route");

    const response = await POST(
      jsonRequest("http://localhost/api/build", {
        generationId: "nope",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("builds a planned generation", async () => {
    const services = await makeServices();
    await seedGeneration(services);
    const { POST } = await import("./build/route");

    const response = await POST(
      jsonRequest("http://localhost/api/build", {
        generationId: "gen1",
      }),
    );

    expect(response.status).toBe(200);
    const { listAssets } = await import("@/lib/generations");
    expect(listAssets(services.db, "gen1")).toHaveLength(1);
  });
});

describe("POST /api/regenerate", () => {
  it("answers 409 on the fourth attempt", async () => {
    const services = await makeServices();
    await seedGeneration(services);
    for (let i = 0; i < 4; i += 1) {
      insertAsset(services.db, {
        id: `a${i}`,
        generationId: "gen1",
        slotId: "vehicle",
        status: "placeholder",
      });
    }
    const { POST } = await import("./regenerate/route");

    const response = await POST(
      jsonRequest("http://localhost/api/regenerate", {
        generationId: "gen1",
        slotId: "vehicle",
      }),
    );

    expect(response.status).toBe(409);
  });
});

describe("GET /api/gallery", () => {
  it("lists generations with image urls", async () => {
    const services = await makeServices();
    await seedGeneration(services, "gen1");
    await seedGeneration(services, "gen2");
    const { GET } = await import("./gallery/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].imageUrl).toMatch(/^\/api\/files\/uploads\//);
  });
});

describe("GET /api/files/[...path]", () => {
  it("serves an uploaded image", async () => {
    const services = await makeServices();
    mkdirSync(path.join(services.dataDir, "uploads"), { recursive: true });
    writeFileSync(
      path.join(services.dataDir, "uploads", "gen1.jpg"),
      Buffer.from("img"),
    );
    const { GET } = await import("./files/[...path]/route");

    const response = await GET(new Request("http://localhost/api/files"), {
      params: Promise.resolve({ path: ["uploads", "gen1.jpg"] }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("refuses path traversal", async () => {
    const services = await makeServices();
    const { GET } = await import("./files/[...path]/route");

    const response = await GET(new Request("http://localhost/api/files"), {
      params: Promise.resolve({ path: ["..", "..", "etc", "passwd"] }),
    });

    expect(response.status).toBe(404);
  });
});
