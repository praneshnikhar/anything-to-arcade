import type { Db } from "./db";

export type GenerationStatus = "planned" | "building" | "ready" | "failed";
export type AssetStatus =
  | "pending"
  | "uploading"
  | "generating"
  | "downloading"
  | "ready"
  | "failed"
  | "placeholder";

export interface GenerationRow {
  id: string;
  imagePath: string;
  imageHash: string;
  planJson: string;
  genre: string;
  status: GenerationStatus;
  createdAt: number;
}

export interface AssetRow {
  id: string;
  generationId: string;
  slotId: string;
  status: AssetStatus;
  tripoTaskId?: string;
  glbPath?: string;
  error?: string | null;
  retries: number;
  createdAt: number;
}

export type AssetPatch = Partial<
  Pick<AssetRow, "status" | "tripoTaskId" | "glbPath" | "error">
>;

interface GenerationRecord {
  id: string;
  image_path: string;
  image_hash: string;
  plan_json: string;
  genre: string;
  status: string;
  created_at: number;
}

interface AssetRecord {
  id: string;
  generation_id: string;
  slot_id: string;
  status: string;
  tripo_task_id: string | null;
  glb_path: string | null;
  error: string | null;
  retries: number;
  created_at: number;
}

function toGeneration(record: GenerationRecord): GenerationRow {
  return {
    id: record.id,
    imagePath: record.image_path,
    imageHash: record.image_hash,
    planJson: record.plan_json,
    genre: record.genre,
    status: record.status as GenerationStatus,
    createdAt: record.created_at,
  };
}

function toAsset(record: AssetRecord): AssetRow {
  const asset: AssetRow = {
    id: record.id,
    generationId: record.generation_id,
    slotId: record.slot_id,
    status: record.status as AssetStatus,
    retries: record.retries ?? 0,
    createdAt: record.created_at,
  };
  if (record.tripo_task_id) asset.tripoTaskId = record.tripo_task_id;
  if (record.glb_path) asset.glbPath = record.glb_path;
  if (record.error) asset.error = record.error;
  return asset;
}

export function insertGeneration(
  db: Db,
  input: {
    id: string;
    imagePath: string;
    imageHash: string;
    planJson: string;
    genre: string;
    status: GenerationStatus;
  },
): void {
  db.prepare(
    `INSERT INTO generations (id, image_path, image_hash, plan_json, genre, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.imagePath,
    input.imageHash,
    input.planJson,
    input.genre,
    input.status,
    Date.now(),
  );
}

export function getGeneration(
  db: Db,
  id: string,
): GenerationRow | undefined {
  const record = db
    .prepare("SELECT * FROM generations WHERE id = ?")
    .get(id) as GenerationRecord | undefined;
  return record ? toGeneration(record) : undefined;
}

export function setGenerationStatus(
  db: Db,
  id: string,
  status: GenerationStatus,
): void {
  db.prepare("UPDATE generations SET status = ? WHERE id = ?").run(status, id);
}

export function insertAsset(
  db: Db,
  input: {
    id: string;
    generationId: string;
    slotId: string;
    status: AssetStatus;
  },
): void {
  db.prepare(
    `INSERT INTO assets (id, generation_id, slot_id, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.generationId, input.slotId, input.status, Date.now());
}

export function getAsset(db: Db, id: string): AssetRow | undefined {
  const record = db
    .prepare("SELECT * FROM assets WHERE id = ?")
    .get(id) as AssetRecord | undefined;
  return record ? toAsset(record) : undefined;
}

export function listAssets(db: Db, generationId: string): AssetRow[] {
  const records = db
    .prepare("SELECT * FROM assets WHERE generation_id = ? ORDER BY created_at ASC")
    .all(generationId) as AssetRecord[];
  return records.map(toAsset);
}

const PATCH_COLUMNS: Record<keyof AssetPatch, string> = {
  status: "status",
  tripoTaskId: "tripo_task_id",
  glbPath: "glb_path",
  error: "error",
};

export function updateAsset(db: Db, id: string, patch: AssetPatch): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of Object.keys(patch) as Array<keyof AssetPatch>) {
    const column = PATCH_COLUMNS[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    values.push(patch[key] ?? null);
  }

  if (sets.length === 0) return;
  db.prepare(`UPDATE assets SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
    id,
  );
}

export function findCachedAsset(
  db: Db,
  imageHash: string,
  slotId: string,
): string | undefined {
  const record = db
    .prepare(
      `SELECT a.glb_path AS glb_path
       FROM assets a
       JOIN generations g ON g.id = a.generation_id
       WHERE g.image_hash = ? AND a.slot_id = ? AND a.status = 'ready' AND a.glb_path IS NOT NULL
       ORDER BY a.created_at DESC
       LIMIT 1`,
    )
    .get(imageHash, slotId) as { glb_path: string } | undefined;
  return record?.glb_path;
}

export function markAssetRetry(db: Db, id: string): number {
  const record = db
    .prepare("UPDATE assets SET retries = retries + 1 WHERE id = ? RETURNING retries")
    .get(id) as { retries: number } | undefined;
  return record?.retries ?? 0;
}

export function listGenerations(db: Db, limit = 50): GenerationRow[] {
  const records = db
    .prepare("SELECT * FROM generations ORDER BY created_at DESC LIMIT ?")
    .all(limit) as GenerationRecord[];
  return records.map(toGeneration);
}
