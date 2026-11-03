import {
  errorJson,
  getServices,
  serviceErrorResponse,
} from "@/lib/api";
import {
  RegenerationLimitError,
  regenerateSlot,
} from "@/lib/generation/orchestrator";
import { getGeneration } from "@/lib/generations";


export async function POST(request: Request): Promise<Response> {
  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  let body: { generationId?: string; slotId?: string };
  try {
    body = await request.json();
  } catch {
    return errorJson("Expected a JSON body.", 400);
  }

  if (!body.generationId || !body.slotId) {
    return errorJson("Missing generationId or slotId.", 400);
  }

  if (!getGeneration(services.db, body.generationId)) {
    return errorJson("Generation not found.", 404);
  }

  try {
    await regenerateSlot({
      db: services.db,
      dataDir: services.dataDir,
      tripo: services.tripo,
      modelVersion: services.env.tripoModelVersion,
      generationId: body.generationId,
      slotId: body.slotId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RegenerationLimitError) {
      return errorJson(error.message, 409);
    }
    if (error instanceof Error && error.message.startsWith("Unknown slot")) {
      return errorJson(error.message, 404);
    }
    return errorJson(
      error instanceof Error ? error.message : "Regeneration failed.",
      500,
    );
  }
}
