import { errorJson, getServices, serviceErrorResponse } from "@/lib/api";
import { listGenerations } from "@/lib/generations";
import { uploadUrl } from "@/lib/storage";


export async function GET(request: Request): Promise<Response> {
  // Touching the request marks this GET as dynamic (Next 16 cacheComponents
  // would otherwise prerender it and freeze the gallery at build time).
  void request.url;

  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  try {
    const items = listGenerations(services.db).map((generation) => ({
      id: generation.id,
      genre: generation.genre,
      status: generation.status,
      createdAt: generation.createdAt,
      imageUrl: uploadUrl(generation.id),
      thumbUrl: uploadUrl(generation.id),
    }));
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorJson("Could not read the gallery.", 500);
  }
}
