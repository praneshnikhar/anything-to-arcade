# Anything → Arcade

Upload an image — a sketch, a photo, a hill-climb scene, a lone football on grass — and the app:

1. **reads the scene** with a vision model (Gemini) and decides which game it should become,
2. **generates the cast in 3D** with the [Tripo API](https://docs.tripo3d.ai/) (image-to-model per entity),
3. **stages a playable game** in the browser with Three.js using one of four templates.

No account, no deploy: it runs entirely on your machine (SQLite + local disk).

## Quickstart

```bash
npm install
cp .env.example .env.local   # add TRIPO_API_KEY + GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

- Tripo key: https://platform.tripo3d.ai/api-keys (API credits are a separate wallet from the web app).
- Gemini key: https://aistudio.google.com/apikey (free tier is fine).
- Generated files and the database live under `./data` (gitignored).

> The free Tripo tier is **non-commercial** and only includes a small number of models. The app is built to degrade gracefully: any failed or unaffordable generation becomes a styled placeholder, so the game always boots.

## What it does

```
image ──► planner (Gemini Flash) ──► ScenePlan JSON
                                        │  genre + entities + bboxes + palette
                                        ▼
                             Tripo image_to_model (parallel tasks)
                                        │  crop → upload → poll → GLB
                                        ▼
                        Three.js template (hill-climb / sports / runner / diorama)
```

- **Sparse scenes are first-class.** A football on grass becomes a penalty game; the template adds goalposts procedurally.
- **Two generation backends.** `TRIPO_BACKEND=procedural` (default) extrudes each detected entity's silhouette into a 3D cutout locally — free, instant, no key, works on any machine. `TRIPO_BACKEND=api` calls the Tripo API for photoreal meshes (needs a key + credits).
- **Every result is identified, not chosen by hand.** The plan screen shows the pick and its reason before any credits are spent.
- **Credit safety:** assets are cached by image hash + slot, plan re-rolls are free, and each slot can be regenerated at most 3 times (enforced server-side).

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
| `npm test` | Vitest suite (planner, Tripo client, storage, orchestrator, routes, game models) |
| `npm run tripo:smoke` | One live Tripo generation using `SAMPLE_IMAGE` (spends credits) |
| `npm run plan:check -- samples/hillclimb.webp` | Live Gemini plan for any image (free) |

Debug a template without credits: `/?debugTemplate=hill_climb` (also `sports_ball`, `endless_runner`, `diorama_viewer`).

## Project layout

- `src/lib/planner/` — Gemini adapter, JSON repair/normalization, genre fallback rules
- `src/lib/tripo/` — Tripo client (upload, image-to-model, task polling)
- `src/lib/procedural/` — local silhouette → 3D cutout generator (mask, outline, GLB export)
- `src/lib/generation/` — fan-out orchestrator, cache reuse, timeouts, placeholder policy
- `src/app/api/` — plan / build / regenerate / generations / gallery / files routes
- `src/game/` — engine shell, asset normalization, templates
- `src/components/` — upload → plan → build → play UI
- `docs/superpowers/specs|plans/` — the design and implementation plan

## Known limitations

- Tripo generation requires credits; with a zero balance every asset falls back to a placeholder (the flow still completes).
- Free-tier Tripo models are public and non-commercial.
- One game per image; genre coverage is the four templates above.
- Local-only by design: no auth, no cloud storage, no public deployment in v1.

## Roadmap

- More templates (walkable world, tower defense) behind the same registry.
- Pro upgrade path for a public gallery.
- Per-slot interactivity in the diorama (walk mode).
