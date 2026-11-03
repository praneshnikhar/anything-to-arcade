import { describe, expect, it } from "vitest";
import { createHillClimbModel } from "./hillClimb";

describe("createHillClimbModel", () => {
  it("accelerates forward and follows terrain height", () => {
    const model = createHillClimbModel({ heights: [0.2, 0.4, 0.6, 0.4, 0.2] });

    model.step(1 / 60, { throttle: 1, brake: 0 });

    expect(model.x).toBeGreaterThan(0);
    expect(model.y).toBeCloseTo(model.groundY(model.x), 1);
  });

  it("collects coins along the track", () => {
    const model = createHillClimbModel({
      heights: Array.from({ length: 32 }, () => 0.4),
    });
    const before = model.coins;

    for (let i = 0; i < 60 * 20 && !model.isOver(); i += 1) {
      model.step(1 / 60, { throttle: 1, brake: 0 });
    }

    expect(model.coins).toBeGreaterThan(before);
  });

  it("finishes at the end of the track with a score", () => {
    const model = createHillClimbModel({
      heights: Array.from({ length: 32 }, () => 0.4),
    });

    for (let i = 0; i < 60 * 90 && !model.isOver(); i += 1) {
      model.step(1 / 60, { throttle: 1, brake: 0 });
    }

    expect(model.isOver()).toBe(true);
    expect(model.score).toBeGreaterThan(0);
  });

  it("jumps above the ground and lands", () => {
    const model = createHillClimbModel({ heights: [0.4] });

    model.step(1 / 60, { throttle: 0, brake: 0, jump: true });
    expect(model.y).toBeGreaterThan(model.groundY(model.x));

    for (let i = 0; i < 200; i += 1) {
      model.step(1 / 60, { throttle: 0, brake: 0 });
    }
    expect(model.y).toBeCloseTo(model.groundY(model.x), 1);
  });
});
