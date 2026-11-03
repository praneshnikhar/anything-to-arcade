import { MissingEnvError, getEnv } from "@/lib/env";

export async function GET(request: Request): Promise<Response> {
  // Dynamic: env can change between build and runtime.
  void request.url;

  try {
    getEnv();
    return Response.json(
      { ok: true, missing: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MissingEnvError) {
      return Response.json(
        { ok: false, missing: error.missing },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { ok: false, missing: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
