import type { VisionAdapter } from "./adapter";
import { isGenre, type Genre } from "./genres";
import { buildPlannerPrompt } from "./prompt";
import {
  ENTITY_ROLES,
  type EntityRole,
  type PlanEntity,
  type ScenePlan,
} from "./schema";

export const DEFAULT_PALETTE = ["#7dd3fc", "#a3e635", "#f59e0b", "#64748b"];

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function clamp01(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function fallbackEntity(): PlanEntity {
  return {
    slotId: "hero",
    label: "scene",
    role: "hero",
    bbox: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
    useForGeneration: true,
  };
}

export function fallbackPlan(reason: string): ScenePlan {
  return {
    sceneType: "unknown",
    chosenGenre: "diorama_viewer",
    genreReason: `We couldn't read the scene, so it became a 3D diorama. (${reason})`,
    confidence: 0,
    entities: [fallbackEntity()],
    palette: [...DEFAULT_PALETTE],
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in planner response");
  }
  return JSON.parse(body.slice(start, end + 1));
}

export function normalizePlan(plan: unknown): ScenePlan {
  const source = (plan ?? {}) as Record<string, unknown>;

  const entities: PlanEntity[] = Array.isArray(source.entities)
    ? source.entities.slice(0, 6).map((raw, index): PlanEntity => {
        const entity = (raw ?? {}) as Record<string, unknown>;
        const bbox = (entity.bbox ?? {}) as Record<string, unknown>;
        const role: EntityRole = ENTITY_ROLES.includes(
          entity.role as EntityRole,
        )
          ? (entity.role as EntityRole)
          : "scenery";

        return {
          slotId:
            typeof entity.slotId === "string" && entity.slotId.trim()
              ? entity.slotId.trim()
              : `entity_${index + 1}`,
          label:
            typeof entity.label === "string" && entity.label.trim()
              ? entity.label.trim()
              : `Entity ${index + 1}`,
          role,
          bbox: {
            x: clamp01(bbox.x),
            y: clamp01(bbox.y),
            w: clamp01(bbox.w),
            h: clamp01(bbox.h),
          },
          useForGeneration:
            role === "terrain" ? false : entity.useForGeneration !== false,
        };
      })
    : [];

  if (entities.length === 0) {
    entities.push(fallbackEntity());
  }

  const palette = Array.isArray(source.palette)
    ? source.palette
        .filter(
          (color): color is string =>
            typeof color === "string" && HEX_COLOR.test(color),
        )
        .slice(0, 6)
    : [];

  const confidence = clamp01(source.confidence);
  let genreReason =
    typeof source.genreReason === "string" && source.genreReason.trim()
      ? source.genreReason.trim()
      : "No reason given.";

  let chosenGenre: Genre = isGenre(source.chosenGenre)
    ? source.chosenGenre
    : "diorama_viewer";

  if (chosenGenre !== "diorama_viewer" && confidence < 0.5) {
    genreReason = `We weren't confident enough that a game fits, so this became a 3D diorama. (${genreReason})`;
    chosenGenre = "diorama_viewer";
  }

  return {
    sceneType:
      typeof source.sceneType === "string" && source.sceneType.trim()
        ? source.sceneType.trim()
        : "unknown",
    chosenGenre,
    genreReason,
    confidence: clamp01(source.confidence),
    entities,
    palette: palette.length > 0 ? palette : [...DEFAULT_PALETTE],
  };
}

export async function planFromImage(input: {
  imagePath: string;
  adapter: VisionAdapter;
}): Promise<ScenePlan> {
  try {
    const text = await input.adapter.analyze(
      input.imagePath,
      buildPlannerPrompt(),
    );
    return normalizePlan(extractJson(text));
  } catch (error) {
    return fallbackPlan(
      error instanceof Error ? error.message : "Unknown planner error",
    );
  }
}
