# Anything → Arcade

Upload an image — a sketch, a photo, a hill-climb scene, a lone football on grass — and the app:

1. **reads the scene** with a vision model (Gemini) and decides which game it should become,
2. **generates the cast in 3D** — locally by default, as stylized silhouette cutouts,
3. **stages a playable game** in the browser with Three.js using one of four templates.

No account, no GPU, no paid API: it runs entirely on your machine (SQLite + local disk).

## Quickstart

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (the only required key)
npm run dev                  # http://localhost:3000
```

- Gemini key (required, free tier): https://aistudio.google.com/apikey
- Generated files and the database live under `./data` (gitignored).

## What it does

```
image ──► planner (Gemini Flash) ──► ScenePlan JSON
                                        │  genre + entities + bboxes + palette
                                        ▼
                          generation backend (local or API)
                                        │  crop → 3D mesh → GLB
                                        ▼
                        Three.js template (hill-climb / sports / runner / diorama)
```

- **Sparse scenes are first-class.** A football on grass becomes a penalty game; the template adds goalposts procedurally.
- **Two generation backends:**
  - `TRIPO_BACKEND=procedural` **(default)** — extrudes each detected entity's silhouette into a 3D cutout locally. Free, instant, no key, works on 8 GB. The look is stylized (cartoon/arcade), not photoreal.
  - `TRIPO_BACKEND=api` — calls the [Tripo API](https://docs.tripo3d.ai/) for photoreal image-to-model meshes. Requires `TRIPO_API_KEY` + API credits.
- **Every result is identified, not chosen by hand.** The plan screen shows the pick and its reason before anything is built.
- **Credit safety (API mode):** assets are cached by image hash + slot, plan re-rolls are free, and each slot can be regenerated at most 3 times (enforced server-side).

## Templates

| Genre | Play | Controls |
|---|---|---|
| `hill_climb` | Drive over terrain extracted from the image's silhouette, collect coins | ← brake · → boost · space jump |
| `sports_ball` | Five penalty attempts against procedural goalposts | hold space to charge · pointer x aims |
| `endless_runner` | Auto-run, jump obstacles, distance score | space jump |
| `diorama_viewer` | Orbit around the generated scene (fallback when nothing fits) | drag to orbit · scroll to zoom |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local app |
| `npm test` | Vitest suite (planner, backends, storage, orchestrator, routes, game models) |
| `npm run plan:check -- samples/hillclimb.webp` | Live Gemini plan for any image (free) |
| `npm run tripo:smoke` | One live Tripo generation using `SAMPLE_IMAGE` (API mode only; spends credits) |

Preview a template without any setup: `/?debugTemplate=hill_climb` (also `sports_ball`, `endless_runner`, `diorama_viewer`).

## Project layout

- `src/lib/planner/` — Gemini adapter, JSON repair/normalization, genre fallback rules
- `src/lib/procedural/` — local silhouette → 3D cutout generator (mask, outline, GLB export) — **default backend**
- `src/lib/tripo/` — Tripo client (upload, image-to-model, task polling) — optional `api` backend
- `src/lib/generation/` — fan-out orchestrator, cache reuse, timeouts, placeholder policy
- `src/app/api/` — plan / build / regenerate / generations / gallery / files routes
- `src/game/` — engine shell, asset normalization, templates
- `src/components/` — upload → plan → build → play UI
- `docs/superpowers/specs|plans/` — the design and implementation plan

## Known limitations

- The default backend produces stylized cutouts, not photoreal meshes — a design trade-off, not a bug.
- `TRIPO_BACKEND=api` needs Tripo credits; on a zero balance every asset falls back to a placeholder. Free-tier Tripo models are public and non-commercial.
- One game per image; genre coverage is the four templates above.
- Local-only by design: no auth, no cloud storage, no public deployment in v1.

## Roadmap

- More templates (walkable world, tower defense) behind the same registry.
- Optional hosted-model backends (Replicate / fal.ai) for photoreal meshes without a Tripo account.
- Per-slot interactivity in the diorama (walk mode).
