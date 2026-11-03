import * as THREE from "three";
import type { GameTemplate } from "@/game/engine/types";

const START_SPEED = 6;
const MAX_SPEED = 14;
const SPEED_RAMP = 0.35;
const JUMP_SPEED = 7.5;
const GRAVITY = 22;
const COLLISION_HEIGHT = 0.6;
const SPAWN_AHEAD = 60;

export interface RunnerObstacle {
  x: number;
  passed: boolean;
}

export interface RunnerModel {
  x: number;
  y: number;
  speed: number;
  grounded: boolean;
  obstacles: RunnerObstacle[];
  spawnObstacleAt(x: number): void;
  step(dt: number, input: { jump: boolean }): void;
  score(): number;
  isOver(): boolean;
}

export function createRunnerModel(seed = 1): RunnerModel {
  let x = 0;
  let y = 0;
  let velocityY = 0;
  let speed = START_SPEED;
  let grounded = true;
  let over = false;
  let nextSpawn = 10;
  let rngState = seed >>> 0;

  const obstacles: RunnerObstacle[] = [];

  function nextGap(): number {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return 8 + (rngState / 0xffffffff) * 6;
  }

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get speed() {
      return speed;
    },
    get grounded() {
      return grounded;
    },
    get obstacles() {
      return obstacles;
    },
    spawnObstacleAt(position: number) {
      obstacles.push({ x: position, passed: false });
    },
    step(dt, input) {
      if (over) return;

      speed = Math.min(MAX_SPEED, speed + dt * SPEED_RAMP);
      x += speed * dt;

      while (nextSpawn < x + SPAWN_AHEAD) {
        obstacles.push({ x: nextSpawn, passed: false });
        nextSpawn += nextGap();
      }

      if (input.jump && grounded) {
        velocityY = JUMP_SPEED;
        grounded = false;
      }

      velocityY -= GRAVITY * dt;
      y += velocityY * dt;

      if (y <= 0) {
        y = 0;
        velocityY = 0;
        grounded = true;
      }

      for (const obstacle of obstacles) {
        if (!obstacle.passed && obstacle.x <= x + 0.5) {
          obstacle.passed = true;
          if (y < COLLISION_HEIGHT) {
            over = true;
          }
        }
      }
    },
    score() {
      return Math.floor(x);
    },
    isOver() {
      return over;
    },
  };
}

function heroAsset(
  ctx: Parameters<GameTemplate["create"]>[0],
): THREE.Object3D | undefined {
  for (const [slotId, object] of ctx.assets) {
    const entity = ctx.plan.entities.find((candidate) => candidate.slotId === slotId);
    if (entity?.role === "hero" || entity?.role === "vehicle") return object;
  }
  return undefined;
}

function obstacleAsset(
  ctx: Parameters<GameTemplate["create"]>[0],
): THREE.Object3D | undefined {
  for (const [slotId, object] of ctx.assets) {
    const entity = ctx.plan.entities.find((candidate) => candidate.slotId === slotId);
    if (entity?.role === "obstacle") return object;
  }
  return undefined;
}

export const runnerTemplate: GameTemplate = {
  id: "endless_runner",
  create(ctx) {
    const model = createRunnerModel();
    const hero = heroAsset(ctx) ?? ctx.assets.values().next().value;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(ctx.palette[1] ?? "#334155"),
        roughness: 0.95,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(1000, 0, 0);
    ground.receiveShadow = true;
    ctx.scene.add(ground);

    if (hero) {
      hero.position.set(0, 0, 0);
      ctx.scene.add(hero);
    }

    const templateObstacle = obstacleAsset(ctx);
    const obstacleMeshes: THREE.Object3D[] = [];
    const obstacleGeometry = new THREE.ConeGeometry(0.45, 1.2, 12);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(ctx.palette[0] ?? "#dc2626"),
      roughness: 0.6,
    });

    function syncObstacles() {
      while (obstacleMeshes.length < model.obstacles.length) {
        const mesh = templateObstacle
          ? templateObstacle.clone(true)
          : new THREE.Mesh(obstacleGeometry, obstacleMaterial);
        mesh.position.set(model.obstacles[obstacleMeshes.length].x, 0.6, 0);
        ctx.scene.add(mesh);
        obstacleMeshes.push(mesh);
      }
      model.obstacles.forEach((obstacle, index) => {
        const mesh = obstacleMeshes[index];
        if (!mesh) return;
        mesh.position.x = obstacle.x;
        mesh.visible = !obstacle.passed;
      });
    }

    return {
      update(dt) {
        model.step(dt, { jump: ctx.input.pressed("jump") });
        syncObstacles();

        if (hero) {
          hero.position.set(model.x, model.y + 0.35, 0);
          hero.rotation.z = model.grounded ? 0 : -0.25;
        }

        const cameraX = model.x + 4;
        ctx.camera.position.set(cameraX, 2.8, 10);
        ctx.camera.lookAt(cameraX, 1.1, 0);
      },
      score() {
        return model.score();
      },
      isOver() {
        return model.isOver();
      },
      dispose() {
        ctx.scene.remove(ground);
        ground.geometry.dispose();
        if (hero) ctx.scene.remove(hero);
        for (const mesh of obstacleMeshes) ctx.scene.remove(mesh);
      },
    };
  },
};
