import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ScenePlan } from "@/lib/planner/schema";
import { loadAssets, normalizeObject } from "./assetLoader";

function planWith(
  entities: ScenePlan["entities"],
): ScenePlan {
  return {
    sceneType: "test",
    chosenGenre: "diorama_viewer",
    genreReason: "test",
    confidence: 1,
    entities,
    palette: ["#dc2626", "#4d7c0f", "#eab308", "#0f172a"],
  };
}

describe("normalizeObject", () => {
  it("scales to target height and recenters on x/z", () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    mesh.position.set(5, 3, -2);

    normalizeObject(mesh, 2);

    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(box.max.y - box.min.y).toBeCloseTo(2, 5);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });
});

describe("loadAssets", () => {
  it("adds a placeholder hero when the plan has no generatable entities", async () => {
    const map = await loadAssets(
      [],
      planWith([
        {
          slotId: "terrain",
          label: "grass",
          role: "terrain",
          bbox: { x: 0, y: 0, w: 1, h: 1 },
          useForGeneration: false,
        },
      ]),
    );

    expect(map.size).toBe(1);
    expect(map.has("hero")).toBe(true);
  });

  it("adds placeholders for eligible slots missing from the asset list", async () => {
    const map = await loadAssets(
      [],
      planWith([
        {
          slotId: "ball",
          label: "football",
          role: "ball",
          bbox: { x: 0.3, y: 0.5, w: 0.2, h: 0.2 },
          useForGeneration: true,
        },
      ]),
    );

    expect(map.get("ball")?.name).toBe("placeholder-ball");
  });
});
