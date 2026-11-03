import {
  errorJson,
  getServices,
  serviceErrorResponse,
} from "@/lib/api";
import { insertGeneration } from "@/lib/generations";
import {
  MAX_UPLOAD_BYTES,
  normalizeImage,
  validateUpload,
} from "@/lib/images";
import { newId, sha256 } from "@/lib/ids";
import { saveUpload } from "@/lib/storage";


export async function POST(request: Request): Promise<Response> {
  let services;
  try {
    services = getServices();
  } catch (error) {
    return serviceErrorResponse(error);
  }

  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return errorJson(
        "Missing image file. Send multipart form data with an `image` field.",
        400,
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_UPLOAD_BYTES) {
      return errorJson("File is larger than 10 MB.", 413);
    }

    const check = validateUpload({ mime: file.type, size: buf.length });
    if (!check.ok) {
      return errorJson(check.reason, 400);
    }

    const normalized = await normalizeImage(buf);
    const id = newId("gen");
    const imagePath = await saveUpload(services.dataDir, id, normalized);
    const plan = await services.planImage(imagePath);

    insertGeneration(services.db, {
      id,
      imagePath,
      imageHash: sha256(normalized),
      planJson: JSON.stringify(plan),
      genre: plan.chosenGenre,
      status: "planned",
    });

    return Response.json({ generationId: id, plan });
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Planning failed.",
      500,
    );
  }
}
