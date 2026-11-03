export interface Env {
  tripoApiKey: string;
  geminiApiKey: string;
  tripoModelVersion: string;
  geminiModel: string;
  dataDir: string;
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
  const required = ["TRIPO_API_KEY", "GEMINI_API_KEY"] as const;
  const missing = required.filter((key) => !source[key]?.trim());

  if (missing.length > 0) {
    throw new MissingEnvError([...missing]);
  }

  return {
    tripoApiKey: source.TRIPO_API_KEY!.trim(),
    geminiApiKey: source.GEMINI_API_KEY!.trim(),
    tripoModelVersion: source.TRIPO_MODEL_VERSION?.trim() || "v2.5-20250123",
    geminiModel: source.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    dataDir: source.DATA_DIR?.trim() || "./data",
  };
}
