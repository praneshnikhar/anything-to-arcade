import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import {
  getGeneration,
  insertAsset,
  insertGeneration,
  listAssets,
  setGenerationStatus,
  updateAsset,
} from "@/lib/generations";
import type { ScenePlan } from "@/lib/planner/schema";
import type { TripoClient } from "@/lib/tripo/types";
import {
  RegenerationLimitError,
  isGeneratable,
  reconcileGeneration,
  regenerateSlot,
  startBuild,
} from "./orchestrator";

async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "ata-orch-"));
  const db = openDb(path.join(dataDir, "db"));
  const imagePath = path.join(dataDir, "uploads", "gen1.jpg");
  const jpg = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#fff" },
  })
    .jpeg()
    .toBuffer();
  // ensure dir exists
  mkdirSync(path.dirname(imagePath), { recursive: true });
  writeFileSync(imagePath, jpg);

  const plan: ScenePlan = {
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
    palette: ["#fff"],
  };

  insertGeneration(db, {
    id: "gen1",
    imagePath,
    imageHash: "hash-1",
    planJson: JSON.stringify(plan),
    genre: "hill_climb",
    status: "planned",
  });

  return { db, dataDir, imagePath };
}

function makeTripo(overrides: Partial<TripoClient> = {}): TripoClient {
  return {
    uploadImage: async () => ({ fileToken: "ft" }),
    createImageToModelTask: async () => ({ taskId: "t1" }),
    getTask: async () => ({ taskId: "t1", status: "running", progress: 10 }),
    ...overrides,
  };
}

function ageAsset(db: Db, assetId: string, ms: number) {
  db.prepare("UPDATE assets SET created_at = ? WHERE id = ?").run(
    Date.now() - ms,
    assetId,
  );
}

describe("isGeneratable", () => {
  it("rejects entities whose bounding box is too small", () => {
    expect(
      isGeneratable({
        slotId: "a",
        label: "a",
        role: "scenery",
        bbox: { x: 0.5, y: 0.5, w: 0.05, h: 0.05 },
        useForGeneration: true,
      }),
    ).toBe(false);
    expect(
      isGeneratable({
        slotId: "a",
        label: "a",
        role: "scenery",
        bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        useForGeneration: true,
      }),
    ).toBe(true);
    expect(
      isGeneratable({
        slotId: "a",
        label: "a",
        role: "terrain",
        bbox: { x: 0, y: 0, w: 1, h: 1 },
        useForGeneration: false,
      }),
    ).toBe(false);
  });
});

describe("startBuild", () => {
  it("reuses cached assets without calling tripo and re-serves them under the new generation", async () => {
    const { db, dataDir } = await setup();
    const cachedDir = path.join(dataDir, "generated", "older");
    mkdirSync(cachedDir, { recursive: true });
    const cachedPath = path.join(cachedDir, "vehicle.glb");
    writeFileSync(cachedPath, "cached-glb");

    insertAsset(db, {
      id: "cached",
      generationId: "gen1",
      slotId: "vehicle",
      status: "ready",
    });
    updateAsset(db, "cached", { glbPath: cachedPath });

    let uploads = 0;
    const tripo = makeTripo({
      uploadImage: async () => {
        uploads += 1;
        return { fileToken: "ft" };
      },
    });

    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    const assets = listAssets(db, "gen1");
    expect(uploads).toBe(0);
    expect(assets.every((asset) => asset.status === "ready")).toBe(true);
    expect(getGeneration(db, "gen1")?.status).toBe("ready");
    expect(
      readFileSync(path.join(dataDir, "generated", "gen1", "vehicle.glb")).toString(),
    ).toBe("cached-glb");
  });

  it("crops, uploads, and creates one task per entity", async () => {
    const { db, dataDir } = await setup();
    const uploaded: Array<{ size: number; filename: string }> = [];
    const tripo = makeTripo({
      uploadImage: async (buf, filename) => {
        uploaded.push({ size: buf.length, filename });
        return { fileToken: "ft" };
      },
    });

    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].filename).toBe("vehicle.jpg");
    expect(uploaded[0].size).toBeGreaterThan(0);

    const assets = listAssets(db, "gen1");
    expect(assets).toHaveLength(1);
    expect(assets[0].status).toBe("generating");
    expect(assets[0].tripoTaskId).toBe("t1");
  });
});

describe("reconcileGeneration", () => {
  it("downloads successful models and marks them ready", async () => {
    const { db, dataDir } = await setup();
    const tripo = makeTripo({
      getTask: async () => ({
        taskId: "t1",
        status: "success",
        progress: 100,
        modelUrl: "https://cdn.example/m.glb",
      }),
    });
    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    const fakeFetch = (async () =>
      new Response(Buffer.from("glb-bytes"), { status: 200 })) as unknown as typeof fetch;

    const view = await reconcileGeneration({
      db,
      dataDir,
      tripo,
      generationId: "gen1",
      fetchImpl: fakeFetch,
    });

    expect(view.assets[0].status).toBe("ready");
    expect(view.assets[0].url).toBe(
      "/api/files/generated/gen1/vehicle.glb",
    );
    expect(view.status).toBe("ready");

    const { readFileSync } = await import("node:fs");
    expect(
      readFileSync(
        path.join(dataDir, "generated", "gen1", "vehicle.glb"),
      ).toString(),
    ).toBe("glb-bytes");
  });

  it("marks failed tasks as placeholders and still reaches ready", async () => {
    const { db, dataDir } = await setup();
    const tripo = makeTripo({
      getTask: async () => ({
        taskId: "t1",
        status: "failed",
        progress: 30,
        error: "boom",
      }),
    });
    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    const view = await reconcileGeneration({
      db,
      dataDir,
      tripo,
      generationId: "gen1",
    });

    expect(view.assets[0].status).toBe("placeholder");
    expect(view.assets[0].error).toContain("boom");
    expect(view.status).toBe("ready");
  });

  it("times out stuck tasks after five minutes", async () => {
    const { db, dataDir } = await setup();
    const tripo = makeTripo();
    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });
    const [asset] = listAssets(db, "gen1");
    ageAsset(db, asset.id, 6 * 60 * 1000);

    const view = await reconcileGeneration({
      db,
      dataDir,
      tripo,
      generationId: "gen1",
    });

    expect(view.assets[0].status).toBe("placeholder");
    expect(view.assets[0].error).toContain("Timed out");
    expect(view.status).toBe("ready");
  });

  it("generates meshes locally via the procedural backend without calling tripo", async () => {
    const { db, dataDir } = await setup();
    let uploads = 0;
    const tripo = makeTripo({
      uploadImage: async () => {
        uploads += 1;
        return { fileToken: "ft" };
      },
    });
    const generateMesh = async () => Buffer.from("glTF-fake");

    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
      generateMesh,
    });

    expect(uploads).toBe(0);
    const [asset] = listAssets(db, "gen1");
    expect(asset.status).toBe("ready");
    expect(getGeneration(db, "gen1")?.status).toBe("ready");
    expect(
      readFileSync(
        path.join(dataDir, "generated", "gen1", "vehicle.glb"),
      ).toString(),
    ).toBe("glTF-fake");
  });

  it("resumes a build interrupted before any asset row existed", async () => {
    const { db, dataDir } = await setup();
    setGenerationStatus(db, "gen1", "building");

    const view = await reconcileGeneration({
      db,
      dataDir,
      tripo: makeTripo(),
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    expect(view.assets).toHaveLength(1);
  });

  it("retries a failed generation once with smart low poly", async () => {
    const { db, dataDir } = await setup();
    let creates = 0;
    const createdTasks: Array<{ faceLimit: number; smartLowPoly?: boolean }> =
      [];
    const tripo: TripoClient = {
      uploadImage: async () => ({ fileToken: "ft" }),
      createImageToModelTask: async (taskInput) => {
        createdTasks.push({
          faceLimit: taskInput.faceLimit,
          smartLowPoly: taskInput.smartLowPoly,
        });
        creates += 1;
        return { taskId: creates === 1 ? "t1" : "t2" };
      },
      getTask: async (taskId) =>
        taskId === "t1"
          ? { taskId: "t1", status: "failed", progress: 0, error: "boom" }
          : {
              taskId: "t2",
              status: "success",
              progress: 100,
              modelUrl: "https://cdn.example/m.glb",
            },
    };

    await startBuild({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
    });

    const fakeFetch = (async () =>
      new Response(Buffer.from("glb"), { status: 200 })) as unknown as typeof fetch;

    // First reconcile: t1 fails → retry creates t2 (still generating).
    await reconcileGeneration({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
      fetchImpl: fakeFetch,
    });
    // Second reconcile: t2 succeeds → ready.
    const view = await reconcileGeneration({
      db,
      dataDir,
      tripo,
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
      fetchImpl: fakeFetch,
    });

    expect(createdTasks[1]).toMatchObject({
      smartLowPoly: true,
      faceLimit: 20000,
    });
    expect(view.assets[0].status).toBe("ready");
    expect(listAssets(db, "gen1")[0].retries).toBe(1);
    expect(view.status).toBe("ready");
  });
});

describe("regenerateSlot", () => {
  it("caps a slot at three regenerations", async () => {
    const { db, dataDir } = await setup();
    for (let i = 0; i < 4; i += 1) {
      insertAsset(db, {
        id: `a${i}`,
        generationId: "gen1",
        slotId: "vehicle",
        status: "placeholder",
      });
    }

    await expect(
      regenerateSlot({
        db,
        dataDir,
        tripo: makeTripo(),
        modelVersion: "v2.5-20250123",
        generationId: "gen1",
        slotId: "vehicle",
      }),
    ).rejects.toBeInstanceOf(RegenerationLimitError);
  });

  it("caps regeneration across slots", async () => {
    const { db, dataDir } = await setup();
    for (const slot of ["a", "b", "c"]) {
      insertAsset(db, {
        id: `${slot}-init`,
        generationId: "gen1",
        slotId: slot,
        status: "placeholder",
      });
      insertAsset(db, {
        id: `${slot}-regen`,
        generationId: "gen1",
        slotId: slot,
        status: "placeholder",
      });
    }

    await expect(
      regenerateSlot({
        db,
        dataDir,
        tripo: makeTripo(),
        modelVersion: "v2.5-20250123",
        generationId: "gen1",
        slotId: "vehicle",
      }),
    ).rejects.toBeInstanceOf(RegenerationLimitError);
  });

  it("skips the cache so a regeneration produces a new asset", async () => {
    const { db, dataDir } = await setup();
    insertAsset(db, {
      id: "cached",
      generationId: "gen1",
      slotId: "vehicle",
      status: "ready",
    });
    updateAsset(db, "cached", { glbPath: "old.glb" });

    let uploads = 0;
    await regenerateSlot({
      db,
      dataDir,
      tripo: makeTripo({
        uploadImage: async () => {
          uploads += 1;
          return { fileToken: "ft" };
        },
      }),
      modelVersion: "v2.5-20250123",
      generationId: "gen1",
      slotId: "vehicle",
    });

    expect(uploads).toBe(1);
    expect(listAssets(db, "gen1")).toHaveLength(2);
  });
});
