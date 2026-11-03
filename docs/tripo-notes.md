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

## Smoke commands

```bash
SAMPLE_IMAGE=samples/hillclimb.webp npm run tripo:smoke   # spends credits
npx tsx scripts/plan-check.ts samples/football.png        # free
```
