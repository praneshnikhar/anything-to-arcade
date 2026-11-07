import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GameTemplate } from "@/game/engine/types";

export const dioramaTemplate: GameTemplate = {
  id: "diorama_viewer",
  create(ctx) {
    const group = new THREE.Group();
    const entries = [...ctx.assets.entries()];

    const starRoles = new Set(["hero", "vehicle", "ball"]);
    let sceneryIndex = 0;

    ctx.plan.entities.forEach((entity) => {
      const object = ctx.assets.get(entity.slotId);
      if (!object) return;

      if (starRoles.has(entity.role)) {
        object.position.set(0, 0, 0);
        group.add(object);
        return;
      }

      const angle = (sceneryIndex / 3) * Math.PI * 2;
      object.position.set(Math.cos(angle) * 2.6, 0, Math.sin(angle) * 2.6);
      sceneryIndex += 1;
      group.add(object);
    });

    // Any asset without a matching entity (debug runs) still shows up.
    for (const [slotId, object] of entries) {
      if (!group.children.includes(object) && !ctx.plan.entities.some((e) => e.slotId === slotId)) {
        object.position.set(0, 0, 0);
        group.add(object);
      }
    }

    ctx.scene.add(group);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 0.12, 48),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(ctx.palette[3] ?? "#1e293b"),
        roughness: 0.9,
      }),
    );
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    ctx.scene.add(floor);

    const controls = new OrbitControls(ctx.camera, ctx.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI * 0.49;
    ctx.camera.position.set(0, 2.6, 6.5);
    controls.update();

    return {
      update() {
        controls.update();
      },
      score() {
        return 0;
      },
      isOver() {
        return false;
      },
      restart() {
        controls.reset();
        ctx.camera.position.set(0, 2.6, 6.5);
        controls.target.set(0, 1, 0);
        controls.update();
      },
      dispose() {
        controls.dispose();
        ctx.scene.remove(group);
        ctx.scene.remove(floor);
        floor.geometry.dispose();
      },
    };
  },
};
