import { describe, expect, it } from "vitest";
import { fixedSteps } from "./loop";

describe("fixedSteps", () => {
  it("floors elapsed time into fixed steps", () => {
    expect(fixedSteps(50, 16.6667, 5)).toBe(3);
  });

  it("clamps to the maximum step count", () => {
    expect(fixedSteps(500, 16.6667, 5)).toBe(5);
  });

  it("ignores negative and non-finite elapsed time", () => {
    expect(fixedSteps(-10)).toBe(0);
    expect(fixedSteps(Number.NaN)).toBe(0);
    expect(fixedSteps(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("returns zero below one step", () => {
    expect(fixedSteps(10)).toBe(0);
  });
});
