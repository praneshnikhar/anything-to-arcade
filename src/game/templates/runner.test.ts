import { describe, expect, it } from "vitest";
import { createRunnerModel } from "./runner";

describe("createRunnerModel", () => {
  it("jumps with gravity arcs", () => {
    const model = createRunnerModel();

    model.step(1 / 60, { jump: true });
    expect(model.y).toBeGreaterThan(0);

    for (let i = 0; i < 200; i += 1) {
      model.step(1 / 60, { jump: false });
    }
    expect(model.y).toBe(0);
    expect(model.grounded).toBe(true);
  });

  it("collision with an obstacle ends the run", () => {
    const model = createRunnerModel();
    model.spawnObstacleAt(0.2);

    model.step(1 / 60, { jump: false });

    expect(model.isOver()).toBe(true);
  });

  it("jumping clears an obstacle", () => {
    const model = createRunnerModel();
    model.spawnObstacleAt(3);

    for (let i = 0; i < 18; i += 1) {
      model.step(1 / 60, { jump: false });
    }
    model.step(1 / 60, { jump: true });
    for (let i = 0; i < 30; i += 1) {
      model.step(1 / 60, { jump: false });
    }

    expect(model.isOver()).toBe(false);
  });

  it("speed ramps and score grows with distance", () => {
    const model = createRunnerModel();
    const startSpeed = model.speed;

    for (let i = 0; i < 300; i += 1) {
      model.step(1 / 60, { jump: false });
    }

    expect(model.speed).toBeGreaterThan(startSpeed);
    expect(model.score()).toBeGreaterThan(0);
  });
});
