import {
  errorJson,
  getServices,
  serviceErrorResponse,
} from "@/lib/api";
import { reconcileGeneration } from "@/lib/generation/orchestrator";
import { getGeneration } from "@/lib/generations";


export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  const { id } = await context.params;
  if (!getGeneration(services.db, id)) {
    return errorJson("Generation not found.", 404);
  }

  try {
    const view = await reconcileGeneration({
      db: services.db,
      dataDir: services.dataDir,
      tripo: services.tripo,
      generationId: id,
    });
    return Response.json(view);
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Status check failed.",
      500,
    );
  }
}
