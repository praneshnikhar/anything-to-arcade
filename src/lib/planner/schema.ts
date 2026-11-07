import { z } from "zod";
import { GENRES, type Genre } from "./genres";

export const ENTITY_ROLES = [
  "hero",
  "vehicle",
  "ball",
  "obstacle",
  "scenery",
  "terrain",
] as const;

export type EntityRole = (typeof ENTITY_ROLES)[number];

export const ScenePlanSchema = z.object({
  sceneType: z.string(),
  chosenGenre: z.enum(GENRES),
  genreReason: z.string(),
  confidence: z.number(),
  entities: z.array(
    z.object({
      slotId: z.string(),
      label: z.string(),
      role: z.enum(ENTITY_ROLES),
      bbox: z.object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      }),
      useForGeneration: z.boolean(),
    }),
  ),
  palette: z.array(z.string()),
});

export type ScenePlan = z.infer<typeof ScenePlanSchema>;
export type PlanEntity = ScenePlan["entities"][number];
export type { Genre };
