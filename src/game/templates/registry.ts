import type { GameTemplate } from "@/game/engine/types";
import type { Genre } from "@/lib/planner/genres";
import { dioramaTemplate } from "./diorama";
import { hillClimbTemplate } from "./hillClimb";
import { runnerTemplate } from "./runner";
import { sportsBallTemplate } from "./sportsBall";

export const templates: Record<Genre, GameTemplate> = {
  hill_climb: hillClimbTemplate,
  sports_ball: sportsBallTemplate,
  endless_runner: runnerTemplate,
  diorama_viewer: dioramaTemplate,
};
