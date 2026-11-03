import { describe, expect, it } from "vitest";
import { getEnv, MissingEnvError } from "./env";

describe("getEnv", () => {
  it("throws MissingEnvError naming absent required keys", () => {
    try {
      getEnv({} as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as MissingEnvError).missing).toEqual([
        "TRIPO_API_KEY",
        "GEMINI_API_KEY",
      ]);
    }
  });

  it("applies defaults and trims", () => {
    const env = getEnv({
      TRIPO_API_KEY: " t ",
      GEMINI_API_KEY: "g",
    } as unknown as NodeJS.ProcessEnv);

    expect(env).toEqual({
      tripoApiKey: "t",
      geminiApiKey: "g",
      tripoModelVersion: "v2.5-20250123",
      geminiModel: "gemini-2.5-flash",
      dataDir: "./data",
    });
  });
});
