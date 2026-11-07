import { describe, expect, it } from "vitest";
import { getEnv, MissingEnvError } from "./env";

describe("getEnv", () => {
  it("requires only the Gemini key for the procedural backend", () => {
    try {
      getEnv({} as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as MissingEnvError).missing).toEqual(["GEMINI_API_KEY"]);
    }
  });

  it("requires the Tripo key when the api backend is selected", () => {
    try {
      getEnv({ TRIPO_BACKEND: "api", GEMINI_API_KEY: "g" } as unknown as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingEnvError);
      expect((error as MissingEnvError).missing).toEqual(["TRIPO_API_KEY"]);
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
      geminiModel: "gemini-flash-lite-latest",
      dataDir: "./data",
      tripoBackend: "procedural",
    });
  });

  it("selects the api backend explicitly", () => {
    const env = getEnv({
      TRIPO_API_KEY: "t",
      GEMINI_API_KEY: "g",
      TRIPO_BACKEND: "api",
    } as unknown as NodeJS.ProcessEnv);

    expect(env.tripoBackend).toBe("api");
  });
});
