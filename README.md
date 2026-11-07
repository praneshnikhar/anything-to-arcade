# Anything → Arcade

Upload an image — a sketch, a photo, a hill-climb scene, a lone football on grass — and the app:

1. **reads the scene** with a vision model and decides which game it should become,
2. **generates the cast in 3D** — locally by default, as stylized silhouette cutouts,
3. **stages a playable game** in the browser with Three.js using one of four templates.

No account, no GPU, no paid API: it runs entirely on your machine (SQLite + local disk).

## Quickstart

```bash
npm install
cp .env.example .env.local   # add your vision-model API key (the only required key)
npm run dev                  # http://localhost:3000
```

- Generated files and the database live under `./data` (gitignored).

## What it does

```
image ──► scene planner ──► ScenePlan JSON
                                 │  genre + entities + bboxes + palette
                                 ▼
                        generation backend (local or hosted)
                                 │  crop → 3D mesh → GLB
                                 ▼
                   Three.js template (hill-climb / sports / runner / diorama)
```

- **Sparse scenes are first-class.** A football on grass becomes a penalty game; the template adds goalposts procedurally.
- **Two generation backends:**
  - `TRIPO_BACKEND=procedural` **(default)** — extrudes each detected entity's silhouette into a 3D cutout locally. Free, instant, no key, works on 8 GB. The look is stylized (cartoon/arcade), not photoreal.
  - `TRIPO_BACKEND=api` — calls a hosted 3D generation API for photoreal image-to-model meshes. Requires an API key + credits.
- **Every result is identified, not chosen by hand.** The plan screen shows the pick and its reason before anything is built.
- **Credit safety (hosted mode):** assets are cached by image hash + slot, plan re-rolls are free, and each slot can be regenerated at most 3 times (enforced server-side).

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
| `npm run plan:check -- samples/hillclimb.webp` | Live scene-plan for any image (free) |

Preview a template without any setup: `/?debugTemplate=hill_climb` (also `sports_ball`, `endless_runner`, `diorama_viewer`).

## Project layout

- `src/lib/planner/` — scene planner (vision-model adapter, JSON repair/normalization, genre fallback rules)
- `src/lib/procedural/` — local silhouette → 3D cutout generator (mask, outline, GLB export) — **default backend**
- `src/lib/tripo/` — hosted 3D API client (upload, image-to-model, task polling) — optional `api` backend
- `src/lib/generation/` — fan-out orchestrator, cache reuse, timeouts, placeholder policy
- `src/app/api/` — plan / build / regenerate / generations / gallery / files routes
- `src/game/` — engine shell, asset normalization, templates
- `src/components/` — upload → plan → build → play UI
- `docs/superpowers/specs|plans/` — the design and implementation plan

## Known limitations

- The default backend produces stylized cutouts, not photoreal meshes — a design trade-off, not a bug.
- `TRIPO_BACKEND=api` needs hosted-API credits; on a zero balance every asset falls back to a placeholder.
- One game per image; genre coverage is the four templates above.
- Local-only by design: no auth, no cloud storage, no public deployment in v1.

## Roadmap

- More templates (walkable world, tower defense) behind the same registry.
- Optional hosted-model backends for photoreal meshes without a specific vendor lock-in.
- Per-slot interactivity in the diorama (walk mode).
