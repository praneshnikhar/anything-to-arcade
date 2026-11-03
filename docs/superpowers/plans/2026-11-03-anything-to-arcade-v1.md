# Anything-to-Arcade v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a localhost web app that takes any uploaded image, has a vision LLM decide which game it should become, generates the scene's 3D assets with the Tripo API, and plays it as one of three Three.js game templates (hill-climb, ball-sports, endless runner) with a diorama fallback.

**Architecture:** Next.js (App Router) hosts the UI and API routes; a planner module wraps Gemini (behind a provider adapter) to produce a validated `ScenePlan`; an orchestrator fans the plan's entities out to Tripo `image_to_model` tasks, polls them, caches results in SQLite + local disk; the browser loads the GLBs into a fixed-timestep Three.js engine that renders the template the plan picked.

**Tech Stack:** Next.js 15 + React 19 + TypeScript (strict) · Three.js · Zod · better-sqlite3 · sharp · Vitest · plain CSS (no Tailwind)

**Spec:** `docs/superpowers/specs/2026-11-03-anything-to-arcade-design.md`

## Global Constraints

- Node ≥ 20 (repo machine runs Node 24); npm; TypeScript `strict: true`.
- Localhost only: no auth, no public deploy, no cloud DB/storage. SQLite file + local disk under `./data` (gitignored).
- Env vars: `TRIPO_API_KEY`, `GEMINI_API_KEY` required; `TRIPO_MODEL_VERSION` (default `v2.5-20250123`), `GEMINI_MODEL` (default `gemini-2.5-flash`), `DATA_DIR` (default `./data`) optional. Missing required keys → readable 503, never a crash.
- Upload rules: accept `image/png`, `image/jpeg`, `image/webp`, `image/gif` (first frame) ≤ 10 MB; normalize to JPEG max 1600px on the long edge before planning/uploading cropped entities.
- Tripo game budgets: `face_limit` 20 000 for hero/vehicle/ball slots, 10 000 for props/scenery; textures compressed; no rigging, no animation tasks, no `generate_parts`.
- Genres are a closed set: `hill_climb | sports_ball | endless_runner | diorama_viewer`. Anything else or low confidence → `diorama_viewer`.
- Individual asset failures never block play: mark `placeholder` and let the template substitute a primitive.
- Free-tier discipline: reused image hash ⇒ reused assets; no regeneration without an explicit user action; regenerations capped at 3 per generation (UI-enforced).
- Every task commits its own work; conventional commits (`feat:`, `test:`, `chore:`).

## Review Focus

1. **Non-image / oversized uploads** (HEIC, PDF, GIF > 10 MB, 0-byte file): the API answers 400/413 with a message the UI shows; nothing is stored, no Tripo call fires.
2. **Abstract or empty images** (blank page, wall texture, screenshot of text): the planner still returns a valid plan — `diorama_viewer` with a stated reason — and the app offers a playable-ish result instead of hanging or erroring.
3. **Missing API keys on a fresh clone**: first run shows "add TRIPO_API_KEY / GEMINI_API_KEY to .env.local"; no unhandled exception reaches the client.
4. **A Tripo task fails, expires, or times out** (5 min): affected slots become `placeholder`, generation reaches `ready`, the game boots, and the gallery shows a partial result — no infinite spinner.
5. **Uploading the same image twice**: the second build reuses cached ready assets by image hash + slot and spends zero Tripo credits.

---

### Task 1: Scaffold app, env loader, test runner

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/env.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getEnv(): Env` where `Env = { tripoApiKey: string; geminiApiKey: string; tripoModelVersion: string; geminiModel: string; dataDir: string }`; `MissingEnvError` with `missing: string[]`. Exported from `src/lib/env.ts`.

- [ ] **Step 1: Scaffold**

Run: `npx create-next-app@latest . --typescript --app --src-dir --no-tailwind --eslint --use-npm --import-alias "@/*"` (accept overwrite prompts for `.gitignore` — keep the existing repo git history). Then install: `npm i zod three better-sqlite3 sharp && npm i -D vitest @types/three @types/better-sqlite3 @types/node`.

- [ ] **Step 2: Configure**

`tsconfig.json`: ensure `"strict": true`. `vitest.config.ts`: `test: { environment: "node", include: ["src/**/*.test.ts"] }`. `.env.example`: the five vars from Global Constraints with placeholder values and one comment line each.

- [ ] **Step 3: Write the failing test** — `src/lib/env.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { getEnv, MissingEnvError } from "./env";

describe("getEnv", () => {
  it("throws MissingEnvError naming absent required keys", () => {
    try { getEnv({} as NodeJS.ProcessEnv); expect.unreachable(); }
    catch (e) {
      expect(e).toBeInstanceOf(MissingEnvError);
      expect((e as MissingEnvError).missing).toEqual(["TRIPO_API_KEY", "GEMINI_API_KEY"]);
    }
  });
  it("applies defaults and trims", () => {
    const env = getEnv({ TRIPO_API_KEY: " t ", GEMINI_API_KEY: "g" } as unknown as NodeJS.ProcessEnv);
    expect(env).toEqual({ tripoApiKey: "t", geminiApiKey: "g", tripoModelVersion: "v2.5-20250123", geminiModel: "gemini-2.5-flash", dataDir: "./data" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/env.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 5: Implement `src/lib/env.ts`**

`getEnv(source = process.env)`; missing required keys → `new MissingEnvError(names)`; `MissingEnvError extends Error` with message `Missing required environment variables: ${missing.join(", ")}. Add them to .env.local — see .env.example.`

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/env.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with env loader and vitest"
```

---

### Task 2: Tripo client + smoke script

**Files:**
- Create: `src/lib/tripo/types.ts`, `src/lib/tripo/client.ts`, `src/lib/tripo/client.test.ts`, `scripts/tripo-smoke.ts`, `package.json` script `tripo:smoke`

**Interfaces:**
- Consumes: `getEnv()`.
- Produces: `createTripoClient(opts: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }): TripoClient` with
  - `uploadImage(buf: Buffer, filename: string): Promise<{ fileToken: string }>`
  - `createImageToModelTask(input: { fileToken: string; faceLimit: number; modelVersion: string }): Promise<{ taskId: string }>`
  - `getTask(taskId: string): Promise<TripoTask>` where `TripoTask = { taskId: string; status: "queued"|"running"|"success"|"failed"|"expired"|"cancelled"|"unknown"; progress: number; modelUrl?: string; error?: string }`
  - Base URL default `https://api.tripo3d.ai/v2/openapi`, `Authorization: Bearer <apiKey>`, JSON envelope `{ code: number, data: ... }` (code 0 = success).

- [ ] **Step 1: Write the failing test** — `src/lib/tripo/client.test.ts` with a stub fetch that records URL/init

```ts
it("uploads multipart and returns a file token", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 0, data: { image_token: "ft_1" } }));
  }) as typeof fetch;
  const c = createTripoClient({ apiKey: "k", fetchImpl: fake });
  await expect(c.uploadImage(Buffer.from("x"), "a.png")).resolves.toEqual({ fileToken: "ft_1" });
  expect(calls[0].url).toBe("https://api.tripo3d.ai/v2/openapi/upload");
});

it("maps task status and surfaces failures", async () => {
  // fake response: { code: 0, data: { task_id: "t1", status: "failed", progress: 0, error: "boom" } }
  // expect getTask("t1") resolves to { taskId: "t1", status: "failed", progress: 0, error: "boom" }
});

it("throws on non-zero code with the API message", async () => {
  // fake response: { code: 1002, message: "bad token" } → rejects with /bad token/
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tripo/client.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement the client**

`uploadImage` posts `FormData` field `file`; reads `data.image_token` into `fileToken`. `createImageToModelTask` posts `{ type: "image_to_model", model_version, face_limit, texture: true, pbr: true, auto_size: true, file: { type: "jpg", file_id: fileToken } }`. `getTask` GETs `/task/${id}`; normalize `task_id|id` and status strings; cap unknown statuses to `"unknown"`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/tripo/client.test.ts` — Expected: PASS.

- [ ] **Step 5: Smoke script**

`scripts/tripo-smoke.ts`: reads `SAMPLE_IMAGE` env path (default `./scripts/sample.jpg`), uploads, creates one task with `face_limit: 10000`, polls every 5 s up to 10 min, prints `task id, status, model url`. Add `"tripo:smoke": "npx tsx scripts/tripo-smoke.ts"` (install `tsx` as dev dep).

- [ ] **Step 6: Manual API check (if a key is available)**

Run: `SAMPLE_IMAGE=<path-to-a-photo> npm run tripo:smoke` — Expected: prints a final `success` and `model url`. **Record in `docs/tripo-notes.md` any field-name differences (`file_id` vs `file_token`) and adjust the client accordingly.** If no key is available, leave `.env.local` unset and continue — the client is contract-tested, and the smoke run is re-attempted in Task 13.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Tripo API client with smoke script"
```

---

### Task 3: Planner — schema, genre registry, Gemini adapter, fallback

**Files:**
- Create: `src/lib/planner/schema.ts`, `src/lib/planner/genres.ts`, `src/lib/planner/prompt.ts`, `src/lib/planner/adapter.ts`, `src/lib/planner/plan.ts`, plus `*.test.ts` for `schema` and `plan`

**Interfaces:**
- Consumes: `getEnv()`.
- Produces:
  - `ScenePlanSchema: z.ZodType<ScenePlan>`; `ScenePlan = { sceneType: string; chosenGenre: Genre; genreReason: string; confidence: number; entities: PlanEntity[]; palette: string[] }`; `PlanEntity = { slotId: string; label: string; role: "hero"|"vehicle"|"ball"|"obstacle"|"scenery"|"terrain"; bbox: { x: number; y: number; w: number; h: number }; useForGeneration: boolean }`; `Genre = "hill_climb"|"sports_ball"|"endless_runner"|"diorama_viewer"`; all bbox values normalized 0–1.
  - `GENRES: readonly Genre[]`; `normalizePlan(plan: unknown): ScenePlan` — clamps bbox, coerces unknown genre/confidence to `diorama_viewer` / `0`, caps entities at 6, forces `role: "terrain"` entities to `useForGeneration: false`.
  - `VisionAdapter = { analyze(imagePath: string, prompt: string): Promise<string> }`; `createGeminiAdapter(apiKey: string, model: string): VisionAdapter` (REST `generateContent` with `inlineData` base64 JPEG).
  - `planFromImage(input: { imagePath: string; adapter: VisionAdapter }): Promise<ScenePlan>` — prompt build → adapter → `extractJson` (first `{...}` code fence or brace slice) → `normalizePlan`; any parse/adapter error → fallback plan `{chosenGenre: "diorama_viewer", genreReason: "We couldn't read the scene, so it became a 3D diorama.", confidence: 0, entities: [hero role entity covering the full image], ...}`.

- [ ] **Step 1: Write failing tests** — `src/lib/planner/plan.test.ts`

```ts
it("parses a fenced JSON plan", async () => {
  const adapter = { analyze: async () => '```json\n{"sceneType":"hills","chosenGenre":"hill_climb","genreReason":"hills","confidence":0.8,"entities":[{"slotId":"vehicle","label":"car","role":"vehicle","bbox":{"x":0.1,"y":0.4,"w":0.2,"h":0.2},"useForGeneration":true}],"palette":["#3a7"]}\n```' };
  const plan = await planFromImage({ imagePath: "x.jpg", adapter });
  expect(plan.chosenGenre).toBe("hill_climb");
  expect(plan.entities[0].slotId).toBe("vehicle");
});

it("falls back to diorama on garbage", async () => {
  const adapter = { analyze: async () => "sorry, I cannot" };
  const plan = await planFromImage({ imagePath: "x.jpg", adapter });
  expect(plan.chosenGenre).toBe("diorama_viewer");
  expect(plan.entities[0].role).toBe("hero");
});

it("coerces an unknown genre and clamps bbox", () => {
  const p = normalizePlan({ sceneType: "x", chosenGenre: "racing", genreReason: "r", confidence: 2, entities: [{ slotId: "a", label: "a", role: "scenery", bbox: { x: -1, y: 0.5, w: 3, h: 0.2 }, useForGeneration: true }], palette: [] });
  expect(p.chosenGenre).toBe("diorama_viewer");
  expect(p.confidence).toBe(1);
  expect(p.entities[0].bbox).toEqual({ x: 0, y: 0.5, w: 1, h: 0.2 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/planner/plan.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement schema/genres/prompt/adapter/plan**

Prompt (`prompt.ts`) asks for: scene type; **choose exactly one of the four genre ids** with the rule — ball visible & playable surface → `sports_ball`; a character/creature/vehicle on open ground → `endless_runner`; a side-view landscape/skyline/hills → `hill_climb`; otherwise `diorama_viewer`; confidence 0–1; up to 6 entities with normalized bboxes and `useForGeneration`; a 4-color hex palette. Says "JSON only, no prose." `extractJson` strips fences then slices first `{` to last `}`. Adapter posts to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}` with `contents:[{parts:[{text},{inline_data:{mime_type:"image/jpeg",data:base64}}]}]`. If the default model id 404s (Google rotates Flash ids), pick the current one from AI Studio and set `GEMINI_MODEL` — keep the default in `env.ts`, don't fork it.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/planner` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add scene planner with genre selection and diorama fallback"
```

---

### Task 4: SQLite store and local storage

**Files:**
- Create: `src/lib/ids.ts`, `src/lib/storage.ts`, `src/lib/db.ts`, `src/lib/generations.ts`, tests for `db`/`storage`/`generations`

**Interfaces:**
- Consumes: `getEnv().dataDir`.
- Produces:
  - `newId(prefix: "gen"|"ast"): string`; `sha256(buf: Buffer): string` (`src/lib/ids.ts`).
  - `openDb(dataDir: string): Database` — creates dirs, applies the two schema tables below, idempotent (`src/lib/db.ts`).
  - `insertGeneration(db, g: {id, imagePath, imageHash, planJson, genre, status:"planned"}): void`; `getGeneration(db, id): GenerationRow | undefined`; `setGenerationStatus(db, id, status)`; `insertAsset(db, a: {id, generationId, slotId, status:"pending"}): void`; `getAsset(db, id)`; `listAssets(db, generationId)`; `updateAsset(db, id, patch: Partial<{status, tripoTaskId, glbPath, error}>): void`; `findCachedAsset(db, imageHash, slotId): string | undefined` (glb_path) (`src/lib/generations.ts`).
  - `saveUpload(dataDir, id, buf): Promise<string>` (→ `data/uploads/<id>.jpg`); `saveGeneratedGlb(dataDir, genId, slotId, buf): Promise<string>` (→ `data/generated/<genId>/<slotId>.glb`); `assetUrl(genId, slotId): string` → `/api/files/generated/<genId>/<slotId>.glb`; `uploadUrl(id): string` → `/api/files/uploads/<id>.jpg`; `ensureDataDirs(dataDir)` (`src/lib/storage.ts`).

- [ ] **Step 1: Write failing tests**

```ts
it("round-trips a generation and its assets", () => {
  const db = openDb(tmpdir());
  insertGeneration(db, { id: "gen1", imagePath: "p", imageHash: "h", planJson: "{}", genre: "hill_climb", status: "planned" });
  insertAsset(db, { id: "a1", generationId: "gen1", slotId: "vehicle", status: "pending" });
  updateAsset(db, "a1", { status: "ready", glbPath: "data/generated/gen1/vehicle.glb" });
  expect(getGeneration(db, "gen1")?.genre).toBe("hill_climb");
  expect(listAssets(db, "gen1")[0].status).toBe("ready");
});

it("finds a cached asset by image hash and slot", () => {
  // insert gen with imageHash "h", asset ready with glbPath "g.glb" → findCachedAsset(db, "h", "vehicle") === "g.glb"
});

it("saveUpload writes the file and returns its path", async () => {
  // expect fs.readFile(path) equals buffer
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib` — Expected: FAIL.

- [ ] **Step 3: Implement**

SQL:

```sql
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY, image_path TEXT NOT NULL, image_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL, genre TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, generation_id TEXT NOT NULL, slot_id TEXT NOT NULL,
  status TEXT NOT NULL, tripo_task_id TEXT, glb_path TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_gen ON assets(generation_id);
CREATE INDEX IF NOT EXISTS idx_gen_hash ON generations(image_hash);
```

`WAIT`: `updateAsset` builds a dynamic `SET` from allow-listed keys (never interpolate arbitrary keys). `findCachedAsset` joins on `generations.image_hash = ? AND assets.slot_id = ? AND assets.status = 'ready'`.

- [ ] **Step 4: Run tests** — `npx vitest run src/lib` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add SQLite generation store and local asset storage"
```

---

### Task 5: Image validation, normalization, cropping

**Files:**
- Create: `src/lib/images.ts`, `src/lib/images.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `validateUpload(input: { mime: string; size: number }): { ok: true } | { ok: false; reason: string }` — allowed mimes from Global Constraints; 1 byte–10 MB; otherwise reason like `"Unsupported file type: application/pdf. Use PNG, JPEG, WebP, or GIF."` or `"File is empty."`.
  - `normalizeImage(buf: Buffer): Promise<Buffer>` — sharp: rotate by EXIF, resize longest edge to ≤ 1600, JPEG quality 85.
  - `cropEntity(buf: Buffer, bbox: {x,y,w,h}): Promise<Buffer>` — clamp, minimum 32×32, JPEG.

- [ ] **Step 1: Write failing tests** — `src/lib/images.test.ts` (generate fixtures with sharp in the test)

```ts
it("rejects unsupported pdf uploads", () => {
  expect(validateUpload({ mime: "application/pdf", size: 1000 })).toEqual({ ok: false, reason: expect.stringContaining("Unsupported") });
});
it("rejects files over 10MB", () => {
  expect(validateUpload({ mime: "image/png", size: 10_000_001 })).toEqual({ ok: false, reason: expect.stringContaining("10 MB") });
});
it("rejects zero-byte files", () => {
  expect(validateUpload({ mime: "image/png", size: 0 })).toEqual({ ok: false, reason: expect.stringContaining("empty") });
});
it("normalizes a 3200x600 png to <=1600px wide jpeg", async () => {
  const png = await sharp({ create: { width: 3200, height: 600, channels: 3, background: "#abc" } }).png().toBuffer();
  const jpg = await normalizeImage(png);
  const meta = await sharp(jpg).metadata();
  expect(meta.format).toBe("jpeg");
  expect(meta.width).toBeLessThanOrEqual(1600);
});
it("crops out a centered bbox", async () => { /* 100x100 white, bbox {0.25,0.25,0.5,0.5} → output 50x50 */ });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/images.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** with sharp; clamp bbox to `[0,1]`, enforce min side 32 px by center-expanding.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add image validation, normalization, cropping, and palette extraction"
```

---

### Task 6: Generation orchestrator — Tripo fan-out, polling, cache, placeholders

**Files:**
- Create: `src/lib/generation/state.ts`, `src/lib/generation/orchestrator.ts`, `src/lib/generation/orchestrator.test.ts`

**Interfaces:**
- Consumes: `TripoClient`, store functions, `cropEntity`, `normalizeImage`, `saveGeneratedGlb`, `findCachedAsset`, `sha256`, `newId`.
- Produces:
  - `startBuild(input: { db, dataDir, tripo, generationId }): Promise<void>` — loads the generation; for each entity with `useForGeneration` (max 5), creates an asset row (`pending`); cache hit ⇒ copy/clone glb path, status `ready`; else upload crop → create Tripo task → status `generating`, store `tripoTaskId`. Sets generation `building`.
  - `reconcileGeneration(input: { db, dataDir, tripo, generationId, now: number }): Promise<GenerationView>` — polls every non-terminal asset; `success` ⇒ download model URL, save GLB, status `ready`; `failed|expired|cancelled` ⇒ `placeholder` + error; a `generating` asset older than `5 * 60 * 1000` (compare against an added `created_at` column — see below) ⇒ `placeholder`, error `"Timed out"`. Once no asset is non-terminal ⇒ generation `ready` (even with placeholders). Returns `{ id, status, genre, plan, assets: AssetView[] }`.
  - `regenerateSlot(input: { db, dataDir, tripo, generationId, slotId }): Promise<void>` — throws `RegenerationLimitError` when the slot already has 1 initial + 3 regeneration asset rows; otherwise cache-checks, creates one new Tripo task, and keeps earlier rows (latest row wins for the slot).
  - `GenerationView`/`AssetView` types as returned above; `ASSET_TIMEOUT_MS = 5 * 60 * 1000`.

- [ ] **Step 1: Update schema test-first** — extend Task 4's `assets` table with `created_at INTEGER NOT NULL`; add to `insertAsset`. Add assertion to Task 4's test that `created_at` round-trips. (Modify `src/lib/db.ts`, `src/lib/generations.ts`, their tests.)

- [ ] **Step 2: Write failing tests** — `src/lib/generation/orchestrator.test.ts` using an in-memory db and fake client

```ts
it("reuses cached assets without calling tripo", async () => {
  // seed: gen hash "h", cached ready asset for slot "vehicle"
  // plan with vehicle entity; fake tripo whose upload throws if called
  await startBuild({...});
  expect(listAssets(db, "gen1").every(a => a.status === "ready")).toBe(true);
});
it("marks failed tasks as placeholders and still reaches ready", async () => {
  // fake tripo: createTask → t1; getTask → {status:"failed", error:"boom"}
  // reconcile → asset placeholder; generation ready
});
it("times out stuck tasks after five minutes", async () => {
  // asset row created_at: now - 6*60*1000, tripo returns running → placeholder "Timed out"
});
it("caps a slot at three regenerations", async () => {
  // seed 1 initial + 3 regeneration asset rows for the slot → regenerateSlot rejects with RegenerationLimitError
});
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/lib/generation` — Expected: FAIL.

- [ ] **Step 4: Implement** `startBuild` and `reconcileGeneration`; all Tripo errors caught per asset (`try/catch` ⇒ `placeholder` with message), never rethrow out of reconciliation.

- [ ] **Step 5: Run tests** — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add generation orchestrator with caching, polling, and placeholder fallback"
```

---

### Task 7: API routes

**Files:**
- Create: `src/app/api/plan/route.ts`, `src/app/api/build/route.ts`, `src/app/api/regenerate/route.ts`, `src/app/api/generations/[id]/route.ts`, `src/app/api/gallery/route.ts`, `src/app/api/files/[...path]/route.ts`, plus `src/lib/api.ts` (dependency container) and route tests

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `POST /api/plan` — multipart `image`; validate → normalize → save upload → hash → plan → insert generation (`status: "planned"`) → `{ generationId, plan }`; errors: 400 bad file, 413 too large, 503 `MissingEnvError`, 500 otherwise (JSON `{ error: string }`).
  - `POST /api/build` — JSON `{ generationId }`; 404 unknown, 409 not `planned`; sets `building`; awaits `startBuild`; `{ ok: true }`.
  - `POST /api/regenerate` — JSON `{ generationId, slotId }`; 404 unknown slot; 409 on `RegenerationLimitError`; awaits `regenerateSlot`; `{ ok: true }`.
  - `GET /api/generations/[id]` — reconcile + `GenerationView`.
  - `GET /api/gallery` — `{ items: Array<{ id, genre, status, createdAt, imageUrl, thumbUrl }> }` (latest 50).
  - `GET /api/files/[...path]` — streams `data/uploads/**` (images, mime by extension) and `data/generated/**` (GLBs, `model/gltf-binary`), path-traversal guarded.
  - `getServices(): { db, tripo, env, dataDir }` in `src/lib/api.ts` (lazy singleton).

- [ ] **Step 1: Write failing tests** — one file per route calling exported `POST`/`GET` with `Request` objects and injected services via a test-only `setServicesForTests()` hook; mocked planner/tripo modules.

```ts
it("plan rejects a PDF with 400", async () => {
  const fd = new FormData(); fd.set("image", new File([Buffer.from("%PDF")], "x.pdf", { type: "application/pdf" }));
  const res = await POST(new Request("http://localhost/api/plan", { method: "POST", body: fd }));
  expect(res.status).toBe(400);
});
it("plan rejects an oversized upload with 413", async () => { /* 10 MB + 1 byte file → 413 */ });
it("plan returns 503 when keys are missing", async () => { /* setServicesForTests with getEnv throwing MissingEnvError */ });
it("build rejects an unknown generation id with 404", async () => { /* POST {generationId:"nope"} → 404 */ });
it("files route refuses path traversal", async () => { /* /api/files/../../etc/passwd → 404 */ });
it("regenerate answers 409 on the fourth attempt", async () => { /* mocked regenerateSlot throwing RegenerationLimitError */ });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/app/api` — Expected: FAIL.

- [ ] **Step 3: Implement** routes; `export const runtime = "nodejs"` on each; convert thrown `MissingEnvError` → 503 with `{ error: message }`; never leak stack traces.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Manual check**

Run `npm run dev`; `curl -s -F "image=@<some.jpg>" localhost:3000/api/plan | head -c 400` — Expected: JSON with `generationId` and a plan (or a readable 503 if keys are unset).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add plan, build, status, gallery, and asset API routes"
```

---

### Task 8: Upload → plan → build → play UI

**Files:**
- Create: `src/app/page.tsx` (replace), `src/components/UploadDropzone.tsx`, `src/components/PlanCard.tsx`, `src/components/BuildProgress.tsx`, `src/components/AssetImageOverlay.tsx`, `src/app/gallery/page.tsx`, `src/app/globals.css` additions

**Interfaces:**
- Consumes: the four APIs.
- Produces: the full flow up to the ready state: drop image → POST `/api/plan` → image with entity bbox overlay + plan card (genre, reason, entity chips) → buttons `Rethink` (re-posts plan) and `Build it` (POST `/api/build`) → poll `/api/generations/:id` every 3 s with staged copy driven by asset statuses → when `ready`, show a "ready — the game engine lands in Task 9" panel (GameCanvas is wired into this page in Task 9). Gallery page lists items, clicking one opens the same generation view.

- [ ] **Step 1: Implement the components and page** (client components; no new unit tests — this task's proof is the manual run in Step 2). Keep `fetch` calls in one `src/lib/client-api.ts` with typed helpers `postPlan(file)`, `postBuild(id)`, `getGeneration(id)`.

- [ ] **Step 2: Manual verification (dev server with keys)**

Run: `npm run dev` → open `http://localhost:3000` → drop a hill-climb-style sketch → verify: plan card says `hill_climb` with a reason; Build it → staged copy cycles; final screen shows the "ready — engine lands next" panel; the generation row exists in `/gallery`. Upload a PDF → red error toast, no request stored.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add upload, plan review, build progress, and play UI"
```

---

### Task 9: Game engine core — loop, input, asset loading, template contract, heightmap

**Files:**
- Create: `src/game/engine/types.ts`, `src/game/engine/loop.ts`, `src/game/engine/controls.ts`, `src/game/engine/assetLoader.ts`, `src/game/engine/placeholders.ts`, `src/game/engine/GameShell.tsx`, `src/game/templates/registry.ts`, `src/components/GameCanvas.tsx`, `src/game/heightmap.ts`, tests for `loop` and `heightmap`

**Interfaces:**
- Consumes: Three.js, `ScenePlan`, asset URLs from `GenerationView`.
- Produces:
  - `fixedSteps(elapsedMs: number, fixedDtMs = 16.6667, maxSteps = 5): number` — clamp, floors, handles negatives/NaN → 0.
  - `extractHeightmap(gray: Uint8ClampedArray, w: number, h: number, samples: number): number[]` — returns `samples` normalized heights (0 = bottom of image, 1 = top), from the lowest bright-to-dark transition column profile; median-smoothed.
  - `GameTemplate` / `TemplateInstance` / `TemplateContext` types:

```ts
export type Genre = "hill_climb" | "sports_ball" | "endless_runner" | "diorama_viewer";
export interface TemplateContext { plan: ScenePlan; assets: Map<string, THREE.Object3D>; scene: THREE.Scene; input: InputState; palette: string[]; }
export interface TemplateInstance { update(dt: number): void; score(): number; isOver(): boolean; dispose(): void; }
export interface GameTemplate { id: Genre; create(ctx: TemplateContext): TemplateInstance; }
export interface InputState { pressed(key: "left"|"right"|"jump"|"action"): boolean; pointer: { x: number; y: number } | null; }
```

  - `loadAssets(view: GenerationView, scene: THREE.Scene): Promise<Map<string, THREE.Object3D>>` — GLTFLoader per ready asset, normalize: compute bbox, scale to target size by role (hero/vehicle ~2 m tall; props ~1–2 m), recenter at origin, cast shadows; failed/missing slot ⇒ `createPlaceholder(role, palette)` from `placeholders.ts`.
  - `GameShell` — canvas component: renderer, camera, lights, fixed-step loop calling `template.update(dt)` (dt seconds), resize handling, keyboard listeners mapping arrows/WASD/space, pointer listeners, cleanup on unmount.
  - `templates: Record<Genre, GameTemplate>` — registry with every genre mapped to a diorama-style `stubTemplate` until Tasks 10–13 replace entries (never crash on a missing template) — plus `GameCanvas` (client component: takes a `GenerationView`, calls `loadAssets`, picks `templates[plan.chosenGenre]`, renders `GameShell`; includes a per-asset **Regenerate** button posting `/api/regenerate`, max 3 tries, 409 → toast).

- [ ] **Step 1: Write failing tests**

```ts
it("fixedSteps clamps and floors", () => {
  expect(fixedSteps(50, 16.6667, 5)).toBe(3);
  expect(fixedSteps(500, 16.6667, 5)).toBe(5);
  expect(fixedSteps(-10)).toBe(0);
  expect(fixedSteps(Number.NaN)).toBe(0);
});
it("extractHeightmap returns normalized samples from a slash shape", () => {
  // 100x100 grayscale: white above y=50, black below → every sample ≈ 0.5
  // second fixture: wedge — left half white/black boundary at 20, right at 80 → samples rise left→right
  expect(hm.length).toBe(32);
  expect(hm.every(v => v >= 0 && v <= 1)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game` — Expected: FAIL.

- [ ] **Step 3: Implement** loop + heightmap first (pure), then engine modules, `GameShell`, the stub registry, and the `GameCanvas` wiring into `src/app/page.tsx` (replacing the Task 8 ready panel).

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Manual check** — with a cached generation from Task 8, open it → canvas mounts, generated assets appear in the stub scene, orbit works, the Regenerate button posts and shows the capped toast on the 4th try.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Three.js game shell, asset normalization, placeholders, and heightmap extraction"
```

---

### Task 10: Hill-climb template

**Files:**
- Create: `src/game/templates/hillClimb.ts`, `src/game/templates/hillClimb.test.ts`
- Modify: `src/game/templates/registry.ts`

**Interfaces:**
- Consumes: `GameTemplate` contract, `extractHeightmap` (heights precomputed in the page from the uploaded image; the template receives `plan` + a `heightmap: number[]` on `TemplateContext` — add `heightmap?: number[]` to the context type in Task 9).
- Produces: `hillClimbTemplate: GameTemplate` and `templates: Record<Genre, GameTemplate>` (registry with hill-climb first; other keys filled by later tasks with `ComingSoonTemplate` stubs that render the diorama fallback until implemented — never crash).

- [ ] **Step 1: Write failing physics/score tests** (`createHillClimbModel` pure part)

```ts
it("accelerates forward and follows terrain height", () => {
  const m = createHillClimbModel({ heights: [0, 0.2, 0.4, 0.2, 0], length: 100 });
  m.step(1 / 60, { throttle: 1, brake: 0 });
  expect(m.x).toBeGreaterThan(0);
  expect(m.y).toBeCloseTo(m.groundY(m.x), 1);
});
it("scores distance plus coins", () => {
  // place a coin ahead, step until collected → score increases by 1 and coin removed
});
it("ends after falling below the terrain for 1s", () => { /* force y < groundY - 2 for 60 steps → isOver true */ });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game/templates/hillClimb.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — terrain mesh from heightmap (PlaneGeometry displaced, palette-tinted), vehicle sprite/GLB with code-driven tilt, camera follow, coins (native spheres) along the ground, gravity/trike physics (x-velocity, y with ground constraint), HUD via `score()`, restart on `isOver`.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Manual play check** — `npm run dev` with a cached hill-climb generation; verify steering + jump, score increments, crash resets. (If no key/generation available, use a debug route: `/?debugTemplate=hill_climb` that mounts the template with a synthetic heightmap — add this param handling.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add playable hill-climb template"
```

---

### Task 11: Ball-sports template (penalty)

**Files:**
- Create: `src/game/templates/sportsBall.ts`, `src/game/templates/sportsBall.test.ts`; modify `registry.ts`

**Interfaces:**
- Produces: `sportsBallTemplate: GameTemplate`; pure helpers `createPenaltyModel({ seed })` with `kick(power: number, aim: number)`, `step(dt)`, `result(): "goal" | "save" | "miss" | null`, `score(): number`.

- [ ] **Step 1: Write failing tests**

```ts
it("aims and kicks within bounds", () => { /* power 0..1, aim -1..1 clamped */ });
it("scores a goal when the ball crosses the goal mouth", () => { /* call kick(0.7, 0); step until result → "goal", score 1 */ });
it("resets after five attempts", () => { /* 5 results → isOver true */ });
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL.

- [ ] **Step 3: Implement** — procedural goalposts, ball physics (simple parabola + plane bounce), aim reticle (pointer x) and hold-to-charge power (space), generated ball GLB or placeholder, scoreboard goals/5.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Manual play check** — debug route `/?debugTemplate=sports_ball`; kick, score, five attempts, restart.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add playable penalty/ball-sports template"
```

---

### Task 12: Endless runner template

**Files:**
- Create: `src/game/templates/runner.ts`, `src/game/templates/runner.test.ts`; modify `registry.ts`

**Interfaces:**
- Produces: `runnerTemplate: GameTemplate`; pure helpers `createRunnerModel({ seed })` with `step(dt)`, `jump()`, `isOver()`, `score()`, `spawnedObstacles()`.

- [ ] **Step 1: Write failing tests**

```ts
it("jumps with gravity arcs", () => { /* jump() → y rises then returns to ground */ });
it("collision with an obstacle ends the run", () => { /* force obstacle at player x, step → isOver true */ });
it("speed ramps and score grows with distance", () => { /* step 5s → speed > initial; score > 0 */ });
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL.

- [ ] **Step 3: Implement** — side-scrolling ground strip (scrolling texture/plane tinted by palette), hero GLB or placeholder bobbing, procedurally spawned obstacles using one generated prop (repeat with variation), jump/duck input, distance+coins score, restart on space.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Manual play check** — debug route `/?debugTemplate=endless_runner`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add playable endless runner template"
```

---

### Task 13: Diorama fallback, wire-up QA, README

**Files:**
- Create: `src/game/templates/diorama.ts`; modify `src/game/templates/registry.ts`, `src/app/page.tsx`, `README.md`

**Interfaces:**
- Produces: `dioramaTemplate: GameTemplate` (orbit camera around the hero asset, palette backdrop, "scene only" caption); complete `templates` registry; README with setup (keys), scripts (`dev`, `test`), demo flow, credit-safety notes, and the smoke-script walkthrough.

- [ ] **Step 1: Implement diorama template** — reuse `loadAssets` hero; OrbitControls from `three/examples/jsm/controls/OrbitControls.js`; `score()` returns 0, `isOver()` false.

- [ ] **Step 2: Wire registry completely** — `templates` has all four genres; unknown/missing ⇒ diorama.

- [ ] **Step 3: Full manual QA (with keys)**

1. `npm test` → all green.
2. `npm run dev` → hill-climb sketch → plan → build → play; note Tripo credits spent in `docs/tripo-notes.md`.
3. Bare football photo → plan says `sports_ball` → play penalty game.
4. Blank page upload → plan is `diorama_viewer` with reason; diorama renders; no crash.
5. Re-upload the same hill-climb sketch → second build completes with zero new Tripo tasks (check server log).
6. Kill the server mid-build, restart, open `/api/generations/<id>` → reconcile resumes and finishes or times out into placeholders.
7. Missing keys (`rm .env.local`, restart) → app shows setup message, not a stack trace.

- [ ] **Step 4: Run the real Tripo smoke test** — `SAMPLE_IMAGE=<hill-climb-sketch> npm run tripo:smoke` → record the final status in `docs/tripo-notes.md`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add diorama fallback, full template registry, and setup docs"
```

---

## Milestones

- **M1 (Tasks 1–7):** pipeline behind APIs — you can curl a plan and a build, assets land on disk.
- **M2 (Tasks 8–10):** first magic moment — image in, playable hill-climb out, in the browser.
- **M3 (Tasks 11–13):** all four templates + calibration QA + demo script.
