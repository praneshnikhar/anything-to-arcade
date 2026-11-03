import * as THREE from "three";
import type { GameTemplate } from "@/game/engine/types";

const GOAL_DISTANCE = 12;
const GOAL_HALF_WIDTH = 2.5;
const GOAL_MIN_HEIGHT = 1;
const GOAL_MAX_HEIGHT = 4;
const GRAVITY = 20;
const MAX_ATTEMPTS = 5;

export interface PenaltyKick {
  power: number;
  aim: number;
}

export interface PenaltyModel {
  distance: number;
  height: number;
  lateral: number;
  attempts: number;
  goals: number;
  flying: boolean;
  lastResult: "goal" | "miss" | null;
  lastKick: PenaltyKick | null;
  kick(power: number, aim: number): void;
  step(dt: number): void;
  resetBall(): void;
  restart(): void;
  score(): number;
  isOver(): boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function createPenaltyModel(): PenaltyModel {
  let distance = 0;
  let height = 0.2;
  let lateral = 0;
  let velocityForward = 0;
  let velocityUp = 0;
  let velocityLateral = 0;
  let flying = false;
  let attempts = 0;
  let goals = 0;
  let lastResult: "goal" | "miss" | null = null;
  let lastKick: PenaltyKick | null = null;

  const model: PenaltyModel = {
    get distance() {
      return distance;
    },
    get height() {
      return height;
    },
    get lateral() {
      return lateral;
    },
    get attempts() {
      return attempts;
    },
    get goals() {
      return goals;
    },
    get flying() {
      return flying;
    },
    get lastResult() {
      return lastResult;
    },
    get lastKick() {
      return lastKick;
    },
    kick(power, aim) {
      if (flying || lastResult !== null || attempts >= MAX_ATTEMPTS) return;
      const clampedPower = clamp(power, 0, 1);
      const clampedAim = clamp(aim, -1, 1);
      lastKick = { power: clampedPower, aim: clampedAim };

      velocityForward = 8 + clampedPower * 14;
      velocityUp = 4 + clampedPower * 10;
      velocityLateral = clampedAim * 5;
      flying = true;
    },
    step(dt) {
      if (!flying) return;

      distance += velocityForward * dt;
      height += velocityUp * dt;
      velocityUp -= GRAVITY * dt;
      lateral += velocityLateral * dt;

      if (distance >= GOAL_DISTANCE) {
        flying = false;
        attempts += 1;
        const scored =
          height >= GOAL_MIN_HEIGHT &&
          height <= GOAL_MAX_HEIGHT &&
          Math.abs(lateral) <= GOAL_HALF_WIDTH;
        lastResult = scored ? "goal" : "miss";
        if (scored) goals += 1;
      }
    },
    resetBall() {
      if (attempts >= MAX_ATTEMPTS) return;
      distance = 0;
      height = 0.2;
      lateral = 0;
      velocityForward = 0;
      velocityUp = 0;
      velocityLateral = 0;
      flying = false;
      lastResult = null;
      lastKick = null;
    },
    score() {
      return goals;
    },
    isOver() {
      return attempts >= MAX_ATTEMPTS;
    },
    restart() {
      distance = 0;
      height = 0.2;
      lateral = 0;
      velocityForward = 0;
      velocityUp = 0;
      velocityLateral = 0;
      flying = false;
      attempts = 0;
      goals = 0;
      lastResult = null;
      lastKick = null;
    },
  };

  return model;
}

function ballAsset(
  ctx: Parameters<GameTemplate["create"]>[0],
): THREE.Object3D | undefined {
  for (const [slotId, object] of ctx.assets) {
    const entity = ctx.plan.entities.find((candidate) => candidate.slotId === slotId);
    if (entity?.role === "ball" || entity?.role === "hero") return object;
  }
  return undefined;
}

export const sportsBallTemplate: GameTemplate = {
  id: "sports_ball",
  create(ctx) {
    const model = createPenaltyModel();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(ctx.palette[1] ?? "#3f6212"),
        roughness: 0.95,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ctx.scene.add(ground);

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
    });
    const postGeometry = new THREE.BoxGeometry(0.16, 3.4, 0.16);
    const leftPost = new THREE.Mesh(postGeometry, postMaterial);
    leftPost.position.set(-GOAL_HALF_WIDTH, 1.7, -GOAL_DISTANCE);
    const rightPost = new THREE.Mesh(postGeometry, postMaterial);
    rightPost.position.set(GOAL_HALF_WIDTH, 1.7, -GOAL_DISTANCE);
    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(GOAL_HALF_WIDTH * 2 + 0.16, 0.16, 0.16),
      postMaterial,
    );
    crossbar.position.set(0, 3.4, -GOAL_DISTANCE);
    for (const part of [leftPost, rightPost, crossbar]) {
      part.castShadow = true;
      ctx.scene.add(part);
    }

    const ball = ballAsset(ctx) ?? ctx.assets.values().next().value;
    if (ball) {
      ball.position.set(0, 0.25, 0);
      ball.castShadow = true;
      ctx.scene.add(ball);
    }

    let charge = 0;
    let charging = false;
    let resultTimer = 0;

    return {
      update(dt) {
        if (model.isOver()) return;

        if (model.lastResult) {
          resultTimer += dt;
          if (resultTimer > 1.2) {
            model.resetBall();
            resultTimer = 0;
          }
        } else {
          const pressedCharging =
            ctx.input.pressed("jump") || ctx.input.pressed("action");
          if (pressedCharging && !model.flying) {
            charging = true;
            charge = Math.min(1, charge + dt * 1.4);
          } else if (charging) {
            charging = false;
            model.kick(charge, (ctx.input.pointer?.x ?? 0) * 1.2);
            charge = 0;
          }
        }

        if (ball) {
          ball.position.set(
            model.lateral,
            model.height,
            -model.distance,
          );
        }

        if (model.lastResult) {
          const flash = model.lastResult === "goal" ? 1.15 : 0.75;
          ground.material.color.setRGB(flash, 0.35, 0.2);
        } else {
          ground.material.color.set(ctx.palette[1] ?? "#3f6212");
        }
      },
      score() {
        return model.score();
      },
      isOver() {
        return model.isOver();
      },
      restart() {
        model.restart();
        charge = 0;
        charging = false;
        resultTimer = 0;
      },
      dispose() {
        ctx.scene.remove(ground);
        ground.geometry.dispose();
        for (const part of [leftPost, rightPost, crossbar]) {
          ctx.scene.remove(part);
        }
        postGeometry.dispose();
        if (ball) ctx.scene.remove(ball);
      },
    };
  },
};
