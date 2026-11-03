import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ScenePlan } from "@/lib/planner/schema";
import { createPlaceholder } from "./placeholders";

const TARGET_HEIGHT: Record<string, number> = {
  hero: 1.8,
  vehicle: 1.1,
  ball: 0.7,
  obstacle: 1.2,
  scenery: 1.6,
  terrain: 1,
};

function roleForSlot(plan: ScenePlan, slotId: string): string {
  return (
    plan.entities.find((entity) => entity.slotId === slotId)?.role ?? "scenery"
  );
}

export function normalizeObject(
  object: THREE.Object3D,
  targetHeight: number,
): void {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  const height = size.y > 0 ? size.y : 1;
  object.scale.setScalar(targetHeight / height);

  box.setFromObject(object);
  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;

  box.setFromObject(object);
  object.position.y -= box.min.y;

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

export async function loadAssets(
  assets: Array<{ slotId: string; status: string; url?: string }>,
  plan: ScenePlan,
): Promise<Map<string, THREE.Object3D>> {
  const loader = new GLTFLoader();
  const map = new Map<string, THREE.Object3D>();

  for (const asset of assets) {
    const role = roleForSlot(plan, asset.slotId);

    if (asset.status === "ready" && asset.url) {
      try {
        const gltf = await loader.loadAsync(asset.url);
        const object = gltf.scene;
        normalizeObject(object, TARGET_HEIGHT[role] ?? 1);
        map.set(asset.slotId, object);
        continue;
      } catch {
        // fall through to placeholder
      }
    }

    map.set(asset.slotId, createPlaceholder(role, plan.palette));
  }

  // Placeholder for every eligible slot the build could not produce.
  for (const entity of plan.entities) {
    if (!map.has(entity.slotId) && entity.useForGeneration) {
      map.set(entity.slotId, createPlaceholder(entity.role, plan.palette));
    }
  }

  // A plan with nothing generatable (e.g. only terrain) still gets a scene.
  if (map.size === 0) {
    map.set("hero", createPlaceholder("hero", plan.palette));
  }

  return map;
}
