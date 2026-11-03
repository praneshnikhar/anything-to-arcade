import { errorJson, getServices, serviceErrorResponse } from "@/lib/api";
import { listGenerations } from "@/lib/generations";
import { uploadUrl } from "@/lib/storage";


export async function GET(): Promise<Response> {
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
    return Response.json({ items });
  } catch {
    return errorJson("Could not read the gallery.", 500);
  }
}
