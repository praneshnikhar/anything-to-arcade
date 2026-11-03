import {
  errorJson,
  getServices,
  serviceErrorResponse,
} from "@/lib/api";
import { startBuild } from "@/lib/generation/orchestrator";
import { getGeneration, setGenerationStatus } from "@/lib/generations";


export async function POST(request: Request): Promise<Response> {
  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  let body: { generationId?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson("Expected a JSON body.", 400);
  }

  if (!body.generationId) {
    return errorJson("Missing generationId.", 400);
  }

  const generation = getGeneration(services.db, body.generationId);
  if (!generation) {
    return errorJson("Generation not found.", 404);
  }
  if (generation.status !== "planned") {
    return errorJson("Generation is not awaiting a build.", 409);
  }

  setGenerationStatus(services.db, generation.id, "building");

  try {
    await startBuild({
      db: services.db,
      dataDir: services.dataDir,
      tripo: services.tripo,
      modelVersion: services.env.tripoModelVersion,
      generationId: generation.id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    setGenerationStatus(services.db, generation.id, "failed");
    return errorJson(
      error instanceof Error ? error.message : "Build failed.",
      500,
    );
  }
}
