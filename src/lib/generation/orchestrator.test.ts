import { mkdtempSync, writeFileSync } from "node:fs";
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
  updateAsset,
} from "@/lib/generations";
import type { ScenePlan } from "@/lib/planner/schema";
import type { TripoClient } from "@/lib/tripo/types";
import {
  RegenerationLimitError,
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
  const { mkdirSync } = await import("node:fs");
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

describe("startBuild", () => {
  it("reuses cached assets without calling tripo", async () => {
    const { db, dataDir } = await setup();
    insertAsset(db, {
      id: "cached",
      generationId: "gen1",
      slotId: "vehicle",
      status: "ready",
    });
    updateAsset(db, "cached", {
      glbPath: "data/generated/older/vehicle.glb",
    });

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
