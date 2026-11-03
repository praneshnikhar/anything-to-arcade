import { readFile } from "node:fs/promises";
import type { Db } from "@/lib/db";
import {
  findCachedAsset,
  getGeneration,
  insertAsset,
  listAssets,
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
const MAX_ASSETS_PER_SLOT = 4; // 1 initial + 3 regenerations
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
  modelVersion: string;
  fetchImpl?: typeof fetch;
}

function faceLimitFor(role: string): number {
  return HERO_ROLES.has(role) ? 20000 : 10000;
}

function parsePlan(generation: GenerationRow): ScenePlan {
  return JSON.parse(generation.planJson) as ScenePlan;
}

async function createOrReuseAsset(
  deps: OrchestratorDeps,
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
    updateAsset(db, assetId, { status: "ready", glbPath: cached });
    return;
  }

  try {
    updateAsset(db, assetId, { status: "uploading" });
    const crop = await cropEntity(imageBuf, entity.bbox);
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
  if (assets.length > 0 && assets.every((asset) => isTerminalAsset(asset.status))) {
    setGenerationStatus(db, generationId, "ready");
  }
}

export async function startBuild(
  input: OrchestratorDeps & { generationId: string },
): Promise<void> {
  const generation = getGeneration(input.db, input.generationId);
  if (!generation) {
    throw new Error(`Generation ${input.generationId} not found`);
  }

  const plan = parsePlan(generation);
  setGenerationStatus(input.db, generation.id, "building");

  const entities = plan.entities
    .filter((entity) => entity.useForGeneration)
    .slice(0, MAX_GENERATED_ENTITIES);

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
  input: OrchestratorDeps & { generationId: string; now?: number },
): Promise<GenerationView> {
  const generation = getGeneration(input.db, input.generationId);
  if (!generation) {
    throw new Error(`Generation ${input.generationId} not found`);
  }

  const now = input.now ?? Date.now();
  const doFetch = input.fetchImpl ?? fetch;

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
        const response = await doFetch(task.modelUrl);
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
  input: OrchestratorDeps & { generationId: string; slotId: string },
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

  const existing = listAssets(input.db, generation.id).filter(
    (asset) => asset.slotId === input.slotId,
  );
  if (existing.length >= MAX_ASSETS_PER_SLOT) {
    throw new RegenerationLimitError();
  }

  const imageBuf = await readFile(generation.imagePath);
  setGenerationStatus(input.db, generation.id, "building");
  await createOrReuseAsset(input, generation, entity, imageBuf, {
    skipCache: true,
  });
}
