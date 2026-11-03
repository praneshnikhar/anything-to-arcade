import path from "node:path";
import { openDb, type Db } from "./db";
import { getEnv, MissingEnvError, type Env } from "./env";
import { createGeminiAdapter } from "./planner/adapter";
import { planFromImage } from "./planner/plan";
import type { ScenePlan } from "./planner/schema";
import { createTripoClient } from "./tripo/client";
import type { TripoClient } from "./tripo/types";

export interface Services {
  db: Db;
  tripo: TripoClient;
  env: Env;
  dataDir: string;
  planImage: (imagePath: string) => Promise<ScenePlan>;
}

let cached: Services | null = null;

export function getServices(): Services {
  if (cached) return cached;

  const env = getEnv();
  const dataDir = path.resolve(env.dataDir);
  const db = openDb(dataDir);
  const tripo = createTripoClient({ apiKey: env.tripoApiKey });
  const adapter = createGeminiAdapter(env.geminiApiKey, env.geminiModel);

  cached = {
    db,
    tripo,
    env,
    dataDir,
    planImage: (imagePath) => planFromImage({ imagePath, adapter }),
  };
  return cached;
}

export function setServicesForTests(services: Services | null): void {
  cached = services;
}

export function errorJson(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function serviceErrorResponse(error: unknown): Response {
  if (error instanceof MissingEnvError) {
    return errorJson(error.message, 503);
  }
  return errorJson("Service initialization failed.", 500);
}
