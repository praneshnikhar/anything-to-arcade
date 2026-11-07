import { readFile } from "node:fs/promises";
import type { Db } from "@/lib/db";
import {
  findCachedAsset,
  getGeneration,
  insertAsset,
  listAssets,
  markAssetRetry,
  setGenerationStatus,
  updateAsset,
  type AssetRow,
  type GenerationRow,
} from "@/lib/generations";
import { newId } from "@/lib/ids";
import { cropEntity } from "@/lib/images";
import type { PlanEntity, ScenePlan } from "@/lib/planner/schema";
import { assetUrl, saveGeneratedGlb } from "@/lib/storage";
import type { TripoClient } from "@/lib/tripo/types";
import {
  ASSET_TIMEOUT_MS,
  isTerminalAsset,
  toAssetView,
  type GenerationView,
} from "./state";

const MAX_GENERATED_ENTITIES = 5;
const MAX_REGENERATIONS_PER_GENERATION = 3;
const HERO_ROLES = new Set(["hero", "vehicle", "ball"]);
const TERMINAL_TASK_STATUSES = new Set([
  "failed",
  "banned",
  "expired",
  "cancelled",
]);

export class RegenerationLimitError extends Error {
  constructor() {
    super("This asset has already been regenerated three times.");
    this.name = "RegenerationLimitError";
  }
}

export interface OrchestratorDeps {
  db: Db;
  dataDir: string;
  tripo: TripoClient;
  fetchImpl?: typeof fetch;
  generateMesh?: (
    crop: Buffer,
    options: { role: string; palette: string[] },
  ) => Promise<Buffer>;
}

export interface BuildDeps extends OrchestratorDeps {
  modelVersion: string;
}

function faceLimitFor(role: string): number {
  return HERO_ROLES.has(role) ? 40000 : 20000;
}

const MIN_ENTITY_AREA = 0.008;

export function isGeneratable(entity: PlanEntity): boolean {
  return (
    entity.useForGeneration &&
    entity.bbox.w * entity.bbox.h >= MIN_ENTITY_AREA
  );
}

function parsePlan(generation: GenerationRow): ScenePlan {
  return JSON.parse(generation.planJson) as ScenePlan;
}

async function createOrReuseAsset(
  deps: BuildDeps,
  generation: GenerationRow,
  entity: PlanEntity,
  imageBuf: Buffer,
  options: { skipCache?: boolean } = {},
): Promise<void> {
  const { db, tripo, modelVersion } = deps;
  const assetId = newId("ast");
  insertAsset(db, {
    id: assetId,
    generationId: generation.id,
    slotId: entity.slotId,
    status: "pending",
  });

  const cached = options.skipCache
    ? undefined
    : findCachedAsset(db, generation.imageHash, entity.slotId);
  if (cached) {
    try {
      const bytes = await readFile(cached);
      const glbPath = await saveGeneratedGlb(
        deps.dataDir,
        generation.id,
        entity.slotId,
        bytes,
      );
      updateAsset(db, assetId, { status: "ready", glbPath });
      return;
    } catch {
      // Cached file is gone or unreadable — fall through to a fresh generation.
    }
  }

  try {
    updateAsset(db, assetId, { status: "uploading" });
    const crop = await cropEntity(imageBuf, entity.bbox);

    if (deps.generateMesh) {
      const glb = await deps.generateMesh(crop, {
        role: entity.role,
        palette: parsePlan(generation).palette,
      });
      const glbPath = await saveGeneratedGlb(
        deps.dataDir,
        generation.id,
        entity.slotId,
        glb,
      );
      updateAsset(db, assetId, { status: "ready", glbPath });
      return;
    }

    const { fileToken } = await tripo.uploadImage(
      crop,
      `${entity.slotId}.jpg`,
    );
    updateAsset(db, assetId, { status: "generating" });
    const { taskId } = await tripo.createImageToModelTask({
      fileToken,
      faceLimit: faceLimitFor(entity.role),
      modelVersion,
      fileType: "jpg",
    });
    updateAsset(db, assetId, { tripoTaskId: taskId });
  } catch (error) {
    updateAsset(db, assetId, {
      status: "placeholder",
      error: error instanceof Error ? error.message : "Generation failed",
    });
  }
}

function finalizeIfDone(db: Db, generationId: string): void {
  const assets = listAssets(db, generationId);
  if (
    assets.length > 0 &&
    assets.every((asset) => isTerminalAsset(asset.status))
  ) {
    setGenerationStatus(db, generationId, "ready");
  }
}

async function retryAsset(
  input: OrchestratorDeps & { modelVersion?: string },
  generation: GenerationRow,
  asset: AssetRow,
  reason?: string,
): Promise<void> {
  markAssetRetry(input.db, asset.id);
  try {
    const entity = parsePlan(generation).entities.find(
      (candidate) => candidate.slotId === asset.slotId,
    );
    if (!entity) throw new Error("Unknown slot");

    const crop = await cropEntity(
      await readFile(generation.imagePath),
      entity.bbox,
    );
    const { fileToken } = await input.tripo.uploadImage(
      crop,
      `${asset.slotId}-retry.jpg`,
    );
    const { taskId } = await input.tripo.createImageToModelTask({
      fileToken,
      faceLimit: Math.max(5000, Math.floor(faceLimitFor(entity.role) / 2)),
      modelVersion: input.modelVersion ?? "",
      fileType: "jpg",
      smartLowPoly: true,
    });
    updateAsset(input.db, asset.id, {
      status: "generating",
      error: null,
      tripoTaskId: taskId,
    });
  } catch (error) {
    updateAsset(input.db, asset.id, {
      status: "placeholder",
      error: `Retry failed: ${error instanceof Error ? error.message : reason ?? "unknown"}`,
    });
  }
}

export async function startBuild(
  input: BuildDeps & { generationId: string },
): Promise<void> {
  const generation = getGeneration(input.db, input.generationId);
  if (!generation) {
    throw new Error(`Generation ${input.generationId} not found`);
  }

  const plan = parsePlan(generation);
  setGenerationStatus(input.db, generation.id, "building");

  const entities = plan.entities.filter(isGeneratable).slice(0, MAX_GENERATED_ENTITIES);

  if (entities.length === 0) {
    setGenerationStatus(input.db, generation.id, "ready");
    return;
  }

  const imageBuf = await readFile(generation.imagePath);

  for (const entity of entities) {
    await createOrReuseAsset(input, generation, entity, imageBuf);
  }

  finalizeIfDone(input.db, generation.id);
}

export async function reconcileGeneration(
  input: OrchestratorDeps & {
    generationId: string;
    now?: number;
    modelVersion?: string;
  },
): Promise<GenerationView> {
  let generation = getGeneration(input.db, input.generationId);
  if (!generation) {
    throw new Error(`Generation ${input.generationId} not found`);
  }

  const now = input.now ?? Date.now();
  const doFetch = input.fetchImpl ?? fetch;

  // Recover a build interrupted before any asset row existed.
  if (
    generation.status === "building" &&
    listAssets(input.db, generation.id).length === 0 &&
    input.modelVersion
  ) {
    await startBuild({
      db: input.db,
      dataDir: input.dataDir,
      tripo: input.tripo,
      fetchImpl: input.fetchImpl,
      generateMesh: input.generateMesh,
      modelVersion: input.modelVersion,
      generationId: generation.id,
    });
    generation = getGeneration(input.db, generation.id) ?? generation;
  }

  for (const asset of listAssets(input.db, generation.id)) {
    if (isTerminalAsset(asset.status)) continue;

    const timedOut = now - asset.createdAt > ASSET_TIMEOUT_MS;

    if (!asset.tripoTaskId) {
      if (timedOut) {
        updateAsset(input.db, asset.id, {
          status: "placeholder",
          error: "Timed out",
        });
      }
      continue;
    }

    try {
      const task = await input.tripo.getTask(asset.tripoTaskId);

      if (task.status === "success") {
        if (!task.modelUrl) {
          updateAsset(input.db, asset.id, {
            status: "placeholder",
            error: "Task succeeded without a model URL",
          });
          continue;
        }
        updateAsset(input.db, asset.id, { status: "downloading" });
        const response = await doFetch(task.modelUrl, {
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          throw new Error(`Model download failed: HTTP ${response.status}`);
        }
        const buf = Buffer.from(await response.arrayBuffer());
        const glbPath = await saveGeneratedGlb(
          input.dataDir,
          generation.id,
          asset.slotId,
          buf,
        );
        updateAsset(input.db, asset.id, { status: "ready", glbPath });
        continue;
      }

      if (TERMINAL_TASK_STATUSES.has(task.status)) {
        if (asset.retries < 1 && input.modelVersion) {
          await retryAsset(input, generation, asset, task.error);
          continue;
        }
        updateAsset(input.db, asset.id, {
          status: "placeholder",
          error: task.error ?? `Task ${task.status}`,
        });
        continue;
      }

      if (timedOut) {
        updateAsset(input.db, asset.id, {
          status: "placeholder",
          error: "Timed out",
        });
      }
    } catch (error) {
      if (timedOut) {
        updateAsset(input.db, asset.id, {
          status: "placeholder",
          error: "Timed out",
        });
      } else {
        updateAsset(input.db, asset.id, {
          error: error instanceof Error ? error.message : "Polling failed",
        });
      }
    }
  }

  finalizeIfDone(input.db, generation.id);

  const refreshed = getGeneration(input.db, generation.id)!;
  return {
    id: refreshed.id,
    status: refreshed.status,
    genre: refreshed.genre,
    plan: parsePlan(refreshed),
    assets: listAssets(input.db, refreshed.id).map((asset) =>
      toAssetView(refreshed.id, asset, assetUrl),
    ),
  };
}

export async function regenerateSlot(
  input: BuildDeps & { generationId: string; slotId: string },
): Promise<void> {
  const generation = getGeneration(input.db, input.generationId);
  if (!generation) {
    throw new Error(`Generation ${input.generationId} not found`);
  }

  const plan = parsePlan(generation);
  const entity = plan.entities.find(
    (candidate) => candidate.slotId === input.slotId,
  );
  if (!entity) {
    throw new Error(`Unknown slot: ${input.slotId}`);
  }

  const existing = listAssets(input.db, generation.id);
  const distinctSlots = new Set(existing.map((asset) => asset.slotId)).size;
  const regenerations = existing.length - distinctSlots;
  if (regenerations >= MAX_REGENERATIONS_PER_GENERATION) {
    throw new RegenerationLimitError();
  }

  const imageBuf = await readFile(generation.imagePath);
  setGenerationStatus(input.db, generation.id, "building");
  await createOrReuseAsset(input, generation, entity, imageBuf, {
    skipCache: true,
  });
}
