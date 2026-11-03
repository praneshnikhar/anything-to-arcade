import type { AssetRow, GenerationStatus } from "@/lib/generations";
import type { ScenePlan } from "@/lib/planner/schema";

export const ASSET_TIMEOUT_MS = 5 * 60 * 1000;

const TERMINAL = new Set(["ready", "failed", "placeholder"]);

export function isTerminalAsset(status: string): boolean {
  return TERMINAL.has(status);
}

export interface AssetView {
  slotId: string;
  status: string;
  url?: string;
  error?: string;
}

export interface GenerationView {
  id: string;
  status: GenerationStatus;
  genre: string;
  plan: ScenePlan;
  assets: AssetView[];
}

export function toAssetView(
  generationId: string,
  asset: AssetRow,
  assetUrl: (generationId: string, slotId: string) => string,
): AssetView {
  const view: AssetView = { slotId: asset.slotId, status: asset.status };
  if (asset.status === "ready") {
    view.url = assetUrl(generationId, asset.slotId);
  }
  if (asset.error) view.error = asset.error;
  return view;
}
