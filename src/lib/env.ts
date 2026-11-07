export type TripoBackend = "procedural" | "api";

export interface Env {
  tripoApiKey: string;
  geminiApiKey: string;
  tripoModelVersion: string;
  geminiModel: string;
  dataDir: string;
  tripoBackend: TripoBackend;
}

export class MissingEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Missing required environment variables: ${missing.join(", ")}. Add them to .env.local — see .env.example.`,
    );
    this.name = "MissingEnvError";
    this.missing = missing;
  }
}

export function getEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const backend = source.TRIPO_BACKEND?.trim() === "api" ? "api" : "procedural";

  // The Tripo key is only required when we actually call the Tripo API;
  // the procedural backend generates meshes locally with no key.
  const required =
    backend === "api"
      ? (["TRIPO_API_KEY", "GEMINI_API_KEY"] as const)
      : (["GEMINI_API_KEY"] as const);
  const missing = required.filter((key) => !source[key]?.trim());

  if (missing.length > 0) {
    throw new MissingEnvError([...missing]);
  }

  return {
    tripoApiKey: source.TRIPO_API_KEY?.trim() ?? "",
    geminiApiKey: source.GEMINI_API_KEY!.trim(),
    tripoModelVersion: source.TRIPO_MODEL_VERSION?.trim() || "v2.5-20250123",
    geminiModel: source.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest",
    dataDir: source.DATA_DIR?.trim() || "./data",
    tripoBackend: backend,
  };
}
