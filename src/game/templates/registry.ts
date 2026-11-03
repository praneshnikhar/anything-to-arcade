import * as THREE from "three";
import type { GameTemplate } from "@/game/engine/types";
import type { Genre } from "@/lib/planner/genres";
import { hillClimbTemplate } from "./hillClimb";
import { sportsBallTemplate } from "./sportsBall";

/**
 * Temporary stand-in for every genre until Tasks 10–13 replace entries.
 * Lines generated assets up in a row and gently sways them.
 */
const stubTemplate: GameTemplate = {
  id: "diorama_viewer",
  create(ctx) {
    const group = new THREE.Group();
    const entries = [...ctx.assets.entries()];

    entries.forEach(([, object], index) => {
      object.position.x = (index - (entries.length - 1) / 2) * 2;
      group.add(object);
    });

    ctx.scene.add(group);
    let elapsed = 0;

    return {
      update(dt) {
        elapsed += dt;
        group.rotation.y = Math.sin(elapsed * 0.4) * 0.35;
      },
      score() {
        return 0;
      },
      isOver() {
        return false;
      },
      dispose() {
        ctx.scene.remove(group);
      },
    };
  },
};

export const templates: Record<Genre, GameTemplate> = {
  hill_climb: hillClimbTemplate,
  sports_ball: sportsBallTemplate,
  endless_runner: stubTemplate,
  diorama_viewer: stubTemplate,
};
