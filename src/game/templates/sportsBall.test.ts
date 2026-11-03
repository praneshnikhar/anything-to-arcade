import { describe, expect, it } from "vitest";
import { createPenaltyModel } from "./sportsBall";

describe("createPenaltyModel", () => {
  it("clamps power and aim", () => {
    const model = createPenaltyModel();

    model.kick(5, -5);

    expect(model.lastKick).toEqual({ power: 1, aim: -1 });
  });

  it("scores a goal when the ball crosses the goal mouth", () => {
    const model = createPenaltyModel();
    model.kick(0.7, 0);

    for (let i = 0; i < 600 && !model.lastResult; i += 1) {
      model.step(1 / 120);
    }

    expect(model.lastResult).toBe("goal");
    expect(model.score()).toBe(1);
  });

  it("misses when the kick is too weak", () => {
    const model = createPenaltyModel();
    model.kick(0.02, 0);

    for (let i = 0; i < 600 && !model.lastResult; i += 1) {
      model.step(1 / 120);
    }

    expect(model.lastResult).toBe("miss");
    expect(model.score()).toBe(0);
  });

  it("ends after five attempts", () => {
    const model = createPenaltyModel();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      model.kick(0.7, 0);
      for (let i = 0; i < 600 && !model.lastResult; i += 1) {
        model.step(1 / 120);
      }
      model.resetBall();
    }

    expect(model.isOver()).toBe(true);
    expect(model.attempts).toBe(5);
  });

  it("restarts a finished session", () => {
    const model = createPenaltyModel();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      model.kick(0.7, 0);
      for (let i = 0; i < 600 && !model.lastResult; i += 1) {
        model.step(1 / 120);
      }
      model.resetBall();
    }
    expect(model.isOver()).toBe(true);

    model.restart();

    expect(model.isOver()).toBe(false);
    expect(model.attempts).toBe(0);
    expect(model.goals).toBe(0);
    expect(model.lastResult).toBeNull();
  });
});
