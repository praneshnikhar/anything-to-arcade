import * as THREE from "three";
import type { GameTemplate } from "@/game/engine/types";

export const MAX_HEIGHT = 8;
const SAMPLE_SPACING = 3;
const MAX_SPEED = 12;
const ACCELERATION = 2.5;
const GRAVITY = 24;
const JUMP_SPEED = 8;
const COIN_RADIUS = 2;

export interface HillClimbInput {
  throttle: number;
  brake: number;
  jump?: boolean;
}

export interface CoinState {
  x: number;
  collected: boolean;
}

export interface HillClimbModel {
  x: number;
  y: number;
  speed: number;
  score: number;
  coins: number;
  worldLength: number;
  coinStates: CoinState[];
  groundY(x: number): number;
  step(dt: number, input: HillClimbInput): void;
  isOver(): boolean;
  restart(): void;
}

export function createHillClimbModel({
  heights,
}: {
  heights: number[];
}): HillClimbModel {
  const samples = heights.length > 0 ? heights : [0.4];
  const worldLength = samples.length * SAMPLE_SPACING;

  const coinStates: CoinState[] = [];
  for (let index = 2; index < samples.length; index += 5) {
    coinStates.push({
      x: (index / Math.max(1, samples.length - 1)) * worldLength,
      collected: false,
    });
  }

  function groundY(x: number): number {
    if (samples.length === 1) return samples[0] * MAX_HEIGHT;
    const t = Math.min(1, Math.max(0, x / worldLength));
    const position = t * (samples.length - 1);
    const low = Math.floor(position);
    const high = Math.min(samples.length - 1, low + 1);
    const fraction = position - low;
    return (
      (samples[low] * (1 - fraction) + samples[high] * fraction) * MAX_HEIGHT
    );
  }

  let x = 0;
  let y = groundY(0);
  let velocityY = 0;
  let speed = 0;
  let score = 0;
  let collectedCoins = 0;
  let over = false;
  let grounded = true;

  return {
    get x() {
      return x;
    },
    set x(value: number) {
      x = value;
    },
    get y() {
      return y;
    },
    set y(value: number) {
      y = value;
    },
    get speed() {
      return speed;
    },
    get score() {
      return score;
    },
    get coins() {
      return collectedCoins;
    },
    worldLength,
    coinStates,
    groundY,
    step(dt, input) {
      if (over) return;

      const targetSpeed =
        input.throttle * MAX_SPEED - input.brake * MAX_SPEED * 0.6;
      speed += (targetSpeed - speed) * Math.min(1, dt * ACCELERATION);
      speed = Math.max(0, Math.min(MAX_SPEED, speed));
      x += speed * dt;

      if (input.jump && grounded) {
        velocityY = JUMP_SPEED;
        grounded = false;
      }

      const ground = groundY(x);
      velocityY -= GRAVITY * dt;
      y += velocityY * dt;

      if (y <= ground) {
        y = ground;
        velocityY = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      for (const coin of coinStates) {
        if (!coin.collected && Math.abs(coin.x - x) < COIN_RADIUS) {
          coin.collected = true;
          collectedCoins += 1;
          score += 100;
        }
      }

      score += speed * dt * 10;

      if (x >= worldLength) {
        over = true;
        score += 250;
      }
    },
    isOver() {
      return over;
    },
    restart() {
      x = 0;
      y = groundY(0);
      velocityY = 0;
      speed = 0;
      score = 0;
      collectedCoins = 0;
      over = false;
      grounded = true;
      for (const coin of coinStates) {
        coin.collected = false;
      }
    },
  };
}

function assetForRole(
  ctx: Parameters<GameTemplate["create"]>[0],
  role: string,
): THREE.Object3D | undefined {
  for (const [slotId, object] of ctx.assets) {
    const entity = ctx.plan.entities.find((candidate) => candidate.slotId === slotId);
    if (entity?.role === role) return object;
  }
  return undefined;
}

export const hillClimbTemplate: GameTemplate = {
  id: "hill_climb",
  create(ctx) {
    const heights =
      ctx.heightmap && ctx.heightmap.length > 0
        ? ctx.heightmap
        : Array.from({ length: 32 }, (_, index) =>
            0.35 + Math.sin(index / 3) * 0.1,
          );

    const model = createHillClimbModel({ heights });
    const samples = heights.length;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(model.worldLength, 0);
    for (let index = samples - 1; index >= 0; index -= 1) {
      shape.lineTo(
        (index / Math.max(1, samples - 1)) * model.worldLength,
        heights[index] * MAX_HEIGHT,
      );
    }
    shape.closePath();

    const terrain = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(ctx.palette[1] ?? "#4d7c0f"),
        roughness: 0.9,
      }),
    );
    terrain.receiveShadow = true;
    ctx.scene.add(terrain);

    const vehicle =
      assetForRole(ctx, "vehicle") ??
      assetForRole(ctx, "hero") ??
      ctx.assets.values().next().value;
    if (vehicle) {
      vehicle.position.set(0, model.groundY(0), 0);
      ctx.scene.add(vehicle);
    }

    const coinMeshes = model.coinStates.map((coin) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(ctx.palette[2] ?? "#eab308"),
          metalness: 0.6,
          roughness: 0.3,
        }),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(
        coin.x,
        model.groundY(coin.x) + 0.6,
        0.5,
      );
      mesh.castShadow = true;
      ctx.scene.add(mesh);
      return mesh;
    });

    return {
      update(dt) {
        model.step(dt, {
          throttle: ctx.input.pressed("right") ? 1 : 0.55,
          brake: ctx.input.pressed("left") ? 1 : 0,
          jump: ctx.input.pressed("jump"),
        });

        if (vehicle) {
          vehicle.position.set(model.x, model.y, 0);
          const slope =
            model.groundY(model.x + 0.6) - model.groundY(model.x - 0.6);
          vehicle.rotation.z = Math.atan2(slope, 1.2) * 0.8;
        }

        model.coinStates.forEach((coin, index) => {
          coinMeshes[index].visible = !coin.collected;
        });

        const cameraX = Math.min(
          Math.max(model.x, 8),
          model.worldLength - 8,
        );
        const ground = model.groundY(cameraX);
        ctx.camera.position.set(cameraX, ground + 4.5, 17);
        ctx.camera.lookAt(cameraX, ground + 1.5, 0);
      },
      score() {
        return Math.round(model.score);
      },
      isOver() {
        return model.isOver();
      },
      restart() {
        model.restart();
        if (vehicle) vehicle.position.set(0, model.y, 0);
      },
      dispose() {
        ctx.scene.remove(terrain);
        terrain.geometry.dispose();
        if (vehicle) ctx.scene.remove(vehicle);
        for (const mesh of coinMeshes) {
          ctx.scene.remove(mesh);
          mesh.geometry.dispose();
        }
      },
    };
  },
};
