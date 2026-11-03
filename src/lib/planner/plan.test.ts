import { describe, expect, it } from "vitest";
import { normalizePlan, planFromImage } from "./plan";

describe("planFromImage", () => {
  it("parses a fenced JSON plan", async () => {
    const adapter = {
      analyze: async () =>
        '```json\n{"sceneType":"hills","chosenGenre":"hill_climb","genreReason":"hills","confidence":0.8,"entities":[{"slotId":"vehicle","label":"car","role":"vehicle","bbox":{"x":0.1,"y":0.4,"w":0.2,"h":0.2},"useForGeneration":true}],"palette":["#3a7"]}\n```',
    };

    const plan = await planFromImage({ imagePath: "x.jpg", adapter });

    expect(plan.chosenGenre).toBe("hill_climb");
    expect(plan.entities[0].slotId).toBe("vehicle");
  });

  it("falls back to diorama on garbage", async () => {
    const adapter = { analyze: async () => "sorry, I cannot" };

    const plan = await planFromImage({ imagePath: "x.jpg", adapter });

    expect(plan.chosenGenre).toBe("diorama_viewer");
    expect(plan.entities[0].role).toBe("hero");
    expect(plan.confidence).toBe(0);
  });

  it("falls back to diorama when the adapter throws", async () => {
    const adapter = {
      analyze: async () => {
        throw new Error("network down");
      },
    };

    const plan = await planFromImage({ imagePath: "x.jpg", adapter });

    expect(plan.chosenGenre).toBe("diorama_viewer");
    expect(plan.genreReason).toContain("network down");
  });
});

describe("normalizePlan", () => {
  it("coerces an unknown genre and clamps bbox", () => {
    const plan = normalizePlan({
      sceneType: "x",
      chosenGenre: "racing",
      genreReason: "r",
      confidence: 2,
      entities: [
        {
          slotId: "a",
          label: "a",
          role: "scenery",
          bbox: { x: -1, y: 0.5, w: 3, h: 0.2 },
          useForGeneration: true,
        },
      ],
      palette: [],
    });

    expect(plan.chosenGenre).toBe("diorama_viewer");
    expect(plan.confidence).toBe(1);
    expect(plan.entities[0].bbox).toEqual({ x: 0, y: 0.5, w: 1, h: 0.2 });
  });

  it("caps entities at six and forces terrain out of generation", () => {
    const entities = Array.from({ length: 8 }, (_, i) => ({
      slotId: `e${i}`,
      label: `e${i}`,
      role: i === 0 ? "terrain" : "scenery",
      bbox: { x: 0, y: 0, w: 0.1, h: 0.1 },
      useForGeneration: true,
    }));

    const plan = normalizePlan({ chosenGenre: "hill_climb", entities });

    expect(plan.entities).toHaveLength(6);
    expect(plan.entities[0].useForGeneration).toBe(false);
  });
});
