import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import {
  findCachedAsset,
  getAsset,
  getGeneration,
  insertAsset,
  insertGeneration,
  listAssets,
  updateAsset,
} from "./generations";
import { assetUrl, saveGeneratedGlb, saveUpload, uploadUrl } from "./storage";

function freshDb() {
  return openDb(mkdtempSync(path.join(tmpdir(), "ata-db-")));
}

function seedGeneration(db: ReturnType<typeof openDb>) {
  insertGeneration(db, {
    id: "gen1",
    imagePath: "data/uploads/gen1.jpg",
    imageHash: "hash-1",
    planJson: "{}",
    genre: "hill_climb",
    status: "planned",
  });
}

describe("generation store", () => {
  it("round-trips a generation and its assets", () => {
    const db = freshDb();
    seedGeneration(db);
    insertAsset(db, {
      id: "a1",
      generationId: "gen1",
      slotId: "vehicle",
      status: "pending",
    });
    updateAsset(db, "a1", {
      status: "ready",
      glbPath: "data/generated/gen1/vehicle.glb",
    });

    expect(getGeneration(db, "gen1")?.genre).toBe("hill_climb");
    expect(getGeneration(db, "gen1")?.status).toBe("planned");
    expect(listAssets(db, "gen1")[0].status).toBe("ready");
    expect(listAssets(db, "gen1")[0].glbPath).toBe(
      "data/generated/gen1/vehicle.glb",
    );
  });

  it("stamps asset created_at", () => {
    const db = freshDb();
    seedGeneration(db);
    insertAsset(db, {
      id: "a1",
      generationId: "gen1",
      slotId: "vehicle",
      status: "pending",
    });

    expect(getAsset(db, "a1")?.createdAt).toBeTypeOf("number");
    expect(getAsset(db, "a1")!.createdAt).toBeGreaterThan(0);
  });

  it("finds a cached asset by image hash and slot", () => {
    const db = freshDb();
    seedGeneration(db);
    insertAsset(db, {
      id: "a1",
      generationId: "gen1",
      slotId: "vehicle",
      status: "ready",
    });
    updateAsset(db, "a1", { glbPath: "data/generated/gen1/vehicle.glb" });

    expect(findCachedAsset(db, "hash-1", "vehicle")).toBe(
      "data/generated/gen1/vehicle.glb",
    );
    expect(findCachedAsset(db, "hash-1", "hero")).toBeUndefined();
    expect(findCachedAsset(db, "other-hash", "vehicle")).toBeUndefined();
  });

  it("updates allow-listed fields", () => {
    const db = freshDb();
    seedGeneration(db);
    insertAsset(db, {
      id: "a1",
      generationId: "gen1",
      slotId: "vehicle",
      status: "pending",
    });

    updateAsset(db, "a1", { status: "generating", tripoTaskId: "t1" });

    expect(getAsset(db, "a1")?.status).toBe("generating");
    expect(getAsset(db, "a1")?.tripoTaskId).toBe("t1");
  });
});

describe("storage", () => {
  it("saveUpload writes the file and returns its path", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ata-store-"));
    const filePath = await saveUpload(dir, "gen1", Buffer.from("hello"));

    expect(filePath.endsWith(path.join("uploads", "gen1.jpg"))).toBe(true);
    expect(readFileSync(filePath).toString()).toBe("hello");
  });

  it("saveGeneratedGlb writes under generated/<gen>/<slot>.glb", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ata-store-"));
    const filePath = await saveGeneratedGlb(
      dir,
      "gen1",
      "vehicle",
      Buffer.from("glb"),
    );

    expect(
      filePath.endsWith(path.join("generated", "gen1", "vehicle.glb")),
    ).toBe(true);
    expect(readFileSync(filePath).toString()).toBe("glb");
  });

  it("sanitizes slot ids used in file paths", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ata-store-"));
    const filePath = await saveGeneratedGlb(
      dir,
      "gen1",
      "../../etc/passwd",
      Buffer.from("glb"),
    );

    expect(filePath.includes("..")).toBe(false);
    expect(statSync(filePath).isFile()).toBe(true);
  });

  it("builds public url paths", () => {
    expect(assetUrl("gen1", "vehicle")).toBe(
      "/api/files/generated/gen1/vehicle.glb",
    );
    expect(uploadUrl("gen1")).toBe("/api/files/uploads/gen1.jpg");
  });
});
