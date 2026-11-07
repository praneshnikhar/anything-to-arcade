# Tripo + Gemini integration notes (verified live)

## Tripo OpenAPI — confirmed contract

Base: `https://api.tripo3d.ai/v2/openapi` · auth: `Authorization: Bearer <key>` · JSON envelope `{ code, message?, data }`, `code === 0` on success.

| Call | Shape |
|---|---|
| `POST /upload` | multipart field `file` (webp/jpeg/png, ≤ 20 MB) → `data.image_token` |
| `POST /task` | `{ type: "image_to_model", model_version, face_limit, texture, pbr, auto_size, file: { type, file_token } }` → `data.task_id` |
| `GET /task/{id}` | `data.status` ∈ `queued, running, success, failed, banned, expired, cancelled, unknown`; `data.output.model` / `pbr_model` / `base_model`; `data.progress`; `data.error` |
| `GET /user/balance` | `data.balance`, `data.frozen` |

- Model download URLs expire **5 minutes** after success — download immediately (the orchestrator does).
- `face_limit` is honoured by v2.x/H3 image-to-model models; `smart_low_poly` is the fallback budget option.
- API credits are separate from Tripo web-app credits.

## Account state (2026-11-03)

- Auth + upload verified live.
- `GET /user/balance` → `{ balance: 0, frozen: 0 }`; task creation answers `You don't have enough credit to create this task`.
- Top up at https://platform.tripo3d.ai/ → the app's placeholder path takes over until then.
- One crop (coins close-up) was rejected with a content-policy error even though credits were the primary blocker; treat tiny/ambiguous crops as expected failures.

## Gemini — model rotation

- `gemini-2.5-flash` is retired for new keys; API recommends newer families via 404 text.
- `gemini-flash-latest` returned **503 high demand** repeatedly on the free key; `gemini-flash-lite-latest` answered.
- Default is therefore `gemini-flash-lite-latest`, overridable with `GEMINI_MODEL`.

## Live planner checks

| Sample | Result | Confidence |
|---|---|---|
| `samples/hillclimb.webp` | `hill_climb` | 98% |
| `samples/football.png` (synthetic ball on grass) | `sports_ball` | 95% |
| `samples/blank.png` | `diorama_viewer` | 100% |

## End-to-end checks (with zero credits)

- `POST /api/plan` → plan persisted (`planned`).
- `POST /api/build` → all entity tasks attempted; failures land as `placeholder`.
- `GET /api/generations/:id` → `ready` even with placeholders.
- `POST /api/regenerate` → three allowed attempts, fourth answers **409**.
- Gallery lists runs with image thumbnails.

## Generation quality levers (added 2026-11-07)

- Every `image_to_model` task sends `orientation: "align_image"`, `enable_image_autofix: true`, `texture_alignment: "original_image"` for faithful, aligned meshes.
- `face_limit` is 40k for hero/vehicle/ball and 20k for props/scenery.
- Entities with a bounding box smaller than ~0.8% of the image are skipped (avoids the content-policy "coins close-up" class of waste).
- Crops are padded 10% so the model doesn't clip subjects.
- A failed generation retries once with `smart_low_poly` + halved `face_limit` before falling back to a placeholder.
- Renderer uses ACES filmic tone mapping + `RoomEnvironment` IBL so PBR assets read correctly.
- Model version is configurable via `TRIPO_MODEL_VERSION` (default `v2.5-20250123`); H3 `v3.0`/`v3.1` and P1 exist in the docs for A/B once credits allow.

## Smoke commands

```bash
SAMPLE_IMAGE=samples/hillclimb.webp npm run tripo:smoke   # spends credits
npx tsx scripts/plan-check.ts samples/football.png        # free
```
