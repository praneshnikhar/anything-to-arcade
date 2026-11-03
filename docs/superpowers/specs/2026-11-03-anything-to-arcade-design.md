# Anything-to-Arcade — Design Document

**Date:** 2026-11-03
**Status:** Draft — awaiting owner approval (builder check pending)
**Working title:** Anything-to-Arcade (renameable)
**One-line pitch:** Upload any image — a drawing, a building, a hill-climb scene — and the app analyzes the scene, decides what game it *could* be, generates the 3D assets for it with Tripo, and hands you a playable browser game themed by your own picture.

---

## 1. Intent and the why

The owner saw Tripo3D (image → 3D model API) and, understanding it only outputs single meshes, still wanted the bigger thing: **give the app a picture, get back a game.** No consumer product does arbitrary "image → game." The honest way to get the same magic is:

1. **Understand the image** with a vision LLM → a structured scene plan (what's in it, which game genre fits, where the subjects are).
2. **Generate the cast** by running Tripo's `image_to_model` on the detected main entity(ies) → game-ready GLBs.
3. **Drop the cast into a pre-built Three.js game template** of the matched genre → play screen, score, controls.

The product decision the owner made in conversation: build experience **option 2 ("Anything-to-Arcade")**, with **hill-climb as one of the three starter templates**. The genre-identification step is the heart of the product: every uploaded scene must get a verdict of *which game this becomes* — and if nothing fits, the app degrades gracefully to a diorama viewer (option 1 kept as the fallback mode).

## 2. Goals / Non-goals / Anti-goals

**Goals (v1):**
- Works on the owner's laptop for v1, playable with keyboard (+ best-effort touch).
- Drag-and-drop an image → watch a readable "understanding → sculpting → staging" progress pipeline → play an actual game themed by that image.
- Three playable genre templates tuned for **bare scenes**: **ball-sports** (football on grass → penalty/keepy-uppy), **endless runner**, **2.5D hill-climb physics racer** (image silhouette becomes terrain). The planner fills missing entities procedurally (goalposts, gates, coins) so even one-object scenes make a complete game.
- Vision-LLM genre identification with a JSON plan (scene type, chosen genre + reason, entities with bounding boxes, palette). Sparse scenes must still resolve to playable archetypes, never to a shrug.
- Tripo asset-generation pipeline with hard game-ready budgets (face limits, compressed textures) and placeholders on failure.
- A simple gallery of past generations on the local machine (no auth).
- Play their scenes with friends by sharing locally (LAN/screenshot) — a public URL is a v2 step.

**Non-goals (v1):**
- No skeletal rigging/mixamo-style character animation — motion is code-driven (bob, tilt, squash). Community testing showed auto-rigging behaves badly on non-humanoid inputs.
- No public deployment in v1 (`just on my laptop`), so no rate limiting/abuse layers, no accounts/auth, no scene editor, no multiplayer, no mobile app, no Unity/Godot export.
- Not "any genre" yet — the template library has exactly three (plus diorama fallback). More templates are the future roadmap, one per iteration.

**Anti-goals (what would make this a failure even if it technically works):**
- A generator that outputs a non-playable 3D sculpture when the user meant "game."
- A pipeline so slow or fragile that a demo never reaches a playable state.
- Ignoring the licensing/credit reality so the app breaks after 13 free models.

## 3. Constraints

- **Tripo is an asset factory, not a game factory.** It returns GLB/FBX/OBJ meshes from images/text. Everything playable comes from our templates.
- **Credits:** web/app billing and API billing are separate wallets. API pricing is per-generation (~30–55 credits per textured model; +10 for `smart_low_poly`, etc. — subject to Tripo's current price page). Free API credits are limited (~a few dozen models); **Pro ($20/mo) unlocks commercial licensing** — free-tier models are `Public · Non-Commercial`. The laptop-only v1 (owner decision) satisfies the license; going public later requires the Pro upgrade first.
- **Mesh weight:** default generations can exceed ~1.5–2M triangles — unusable in-game. Every game-destined request must set `face_limit` (props ~10k–30k) and compressed textures; `smart_low_poly` (1k–20k faces) is the budget option.
- **Latency:** generation is async, roughly ~1–2 min per asset; multi-asset scenes are created in parallel, but the wait UX is a required feature, not decoration.
- **Vision LLM bounding boxes are approximate**; slots must tolerate wrong crops (owner can retry that one slot).
- **Browser budget:** keep per-page GLB payload ≤ ~15 MB total; scale/normalize every generated mesh on load (generated assets arrive at arbitrary scale/orientation).

## 4. Approaches considered (the four player experiences)

| # | Experience | What it is | Tradeoff | Verdict |
|---|---|---|---|---|
| 1 | 🗿 Diorama Explorer | Image → single Tripo model → orbit/inspect viewer | Works with any input, tiny build — but not a game | Kept as **fallback mode** |
| 2 | 🎮 Anything-to-Arcade | Vision LLM picks genre → prebuilt template + Tripo assets | Each template is real build effort; gameplay is canned | **CHOSEN — v1** |
| 3 | 🚶 Walk-in World | Multi-asset walkable world + light quest | Fiddliest assembly; thin win conditions | Future iteration |
| 4 | 🏔️ Hill-Climb Racer | Side-view silhouette → heightmap → 2.5D physics racer | One genre only, but the image-to-terrain fit is elegant | **Included as starter template inside #2** |

**Why #2:** it literally is the owner's stated concept ("we identify what game can be built in the scene"), breadth grows by adding templates, and #1/#3/#4 all decompose into pieces of it (fallback mode, future world template, physics template).

## 5. Decisions the owner made (recorded)

1. Build **option 2 (Anything-to-Arcade)** — the genre-identifying arcade generator; not the pure diorama viewer, not the walkable world first.
2. **Hill-climb is one of the three starter templates** — important: hill-climb was an *example*, not the product.
3. "It can be any kind of game" is satisfied via **template breadth**, not by generating arbitrary gameplay.
4. **The planner must handle any scene, including bare ones** ("maybe just a football on the ground — that's it") — a sparse scene still becomes a full game (e.g., penalty/keepy-uppy with procedurally added goalposts). This answer demoted the top-down arcade racer (weakest image→asset fit, and rarest input type) and promoted a **ball-sports template** into the v1 trio.
5. **Wallet: free tier only** (Tripo API + Gemini free keys), lean credit testing; upgrade later only if it works. Consequence: laptop-only demo until a Pro upgrade changes licensing.
6. **Audience: just the owner, on the laptop** (no public URL in v1 → no rate limiting/abuse layer; local gallery).

## 6. Architecture (v1)

```
Image ──► Upload screen
            │
            ▼
        Planner (vision LLM) ──► ScenePlan JSON
            │                        {scene_type, scene_heuristic: "hill_climb_scene",
            │                         chosen_genre: "hill_climb",
            │                         entities: [{slot_id, label, bbox, use_as}], palette}
            ▼
        Asset Factory (Tripo)
            │   for each entity: crop image → create task (parallel) → poll
            │   → download GLB → normalize budget (face_limit) → store locally
            ▼
        Template Engine (Three.js)
            │   genre.registry[plan.chosen_genre] → loader injects assets
            │   into slots {hero, obstacles[], scenery[], terrain}
            ▼
        Play screen (controls, score, HUD) ──► Gallery (past runs, GLB thumbs)
```

- **Genre registry:** `{sports_ball, endless_runner, hill_climb, diorama_viewer}`. The planner maps scene content to an archetype (ball detected → `sports_ball`; figure/creature on ground → `endless_runner`; landscape/hills/tracks → `hill_climb`). If the planner's genre isn't in the registry, confidence is low, or the scene is unusable for play, it returns `diorama_viewer` with a stated reason.
- **Entity slots per genre:** hill-climb needs `{vehicle, terrain(silhouette), scenery[2–4]}`; runner needs `{hero, obstacles[3], collectibles(native coins)}`; sports-ball needs `{ball, surface/ground, scenery props[]}` — goalposts/crosshairs/hud targets are **procedural geometry**, so a bare ball-on-grass still plays complete.
- **Terrain trick (hill-climb only):** the planner finds a horizontal side-view silhouette strip in the image; its darkness/brightness profile (or outline path) becomes the heightmap for the physics track. This is the one input where a sketch is *already* a level.
- **Failure discipline:** every generation has budget (timeout ~5 min) → a template-native placeholder (styled primitive mesh) so the game is always playable; individual slots are re-generatable without regenerating the whole scene.
- **Plan rehearsal:** the planner output is shown as "we'd build a **hill-climb** out of this" with an explicit **"Build it"** confirm button (no auto-start countdown). Re-rolling the *plan* costs only LLM tokens — Tripo credits burn only on confirmed builds. Individual slots can be regenerated without regenerating the whole scene, capped per session (see the wallet call in §7).

## 7. Calls made while drafting (owner hasn't reviewed these)

- **Stack: Next.js + TypeScript + plain Three.js** (no react-three-fiber in the game loop — a plain `requestAnimationFrame` loop inside a canvas component is easier to debug for fixed-timestep physics). Serverless API routes for planner + asset factory.
- **Vision LLM: Gemini Flash family via a provider-agnostic adapter** (cheap, fast, generous free tier, acceptable bboxes). Swappable behind an interface; GPT-class models are a config change.
- **Tripo usage: `image_to_model` (H3-class `v2.5`/`v3.x`)** with `face_limit` per slot, compressed textures; `smart_low_poly` reserved for candidates that fail the budget. No rigging calls in v1.
- **Persistence: SQLite (local file) for `generations` records + generated GLBs on local disk.** v1 keeps everything on the owner's machine; no cloud DB/storage, no Vercel Blob.
- **Runtime: local (localhost dev server).** Web deployment is explicitly deferred to v2 — nothing in the code depends on remote hosting, and a later Vercel deploy is a config/infra task, not a rewrite.
- **Interaction defaults:** explicit "Build it" confirm between plan and generation (no auto-start); plan re-rolls are free (LLM-only); single-slot regenerations capped (~3 per scene) — cheap insurance for a free-tier wallet.
- **Progress UX is a feature:** staged status ("reading your scene… sculpting 3 assets… planting trees…") with the plan visible during the wait.

## 8. What's left to the builder

- Concrete API-route shapes/zod schemas, state machine for the generation pipeline, exact Tripo parameter tuning per slot (start from docs: `face_limit`, `texture_quality=standard`, `pbr=true`, `auto_size=true`).
- Physics/config per template (feel, difficulty, scoring).
- The placeholder-asset system (primitives with the plan's palette).
- Heightmap extraction tuning (insolation strip choice, smoothing).
- The gallery UI.
- Anything genuinely ambiguous that the document misses requires asking the owner rather than guessing silently.

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generated assets don't map onto gameplay (a "car" that's a blob, wrong orientation) | High | Bbox check + owner regen of single slots; auto-normalization (scale/orient) on load; placeholder fallback keeps demo alive |
| Planner returns unbuildable genre | Medium | Registry whitelist + `diorama_viewer` fallback with reason |
| Credit burn during testing | Certain | Single-asset dry-run mode + cached generations keyed by (image hash, slot) so retries don't re-pay |
| Licenses (free-tier non-commercial) ever block the demo | Low in v1 (laptop-only by owner decision) | Public hosting waits for the Pro upgrade; until then everything stays local |
| Latency kills demo momentum | Medium | Parallel tasks + staged progress UX; assets from the gallery play instantly on replay |

## 10. Success criterion

The owner uploads a wobbly side-view sketch of a hill-climb scene; about two minutes later they're driving a wobbly car up *their own hills*, collecting coins. Then they upload a bare photo of a football on grass — and get a penalty/keepy-uppy game built around that same ball, with goalposts the templates added procedurally. Two scenes, two genres, both *identified*, not chosen.

## 11. Sources (consulted during design)

- Tripo OpenAPI docs — https://docs.tripo3d.ai/ (image/target-to-model pricing, `face_limit`, `smart_low_poly`, task query, upload STS)
- rohanmori, "Tripo AI Review 2026" — https://dev.to/rohanmori/tripo-ai-review-2026-i-tested-the-free-3d-model-generator-end-to-end-2ok7 (free-tier limits, ~1.9M-face raw meshes, retopo step, license tiers)
- abigail_armijo, "Hands-On Tour of Meshy, Tripo, and Three.js" — https://dev.to/abigail_armijo/what-i-learned-exploring-ai-generated-3d-a-hands-on-tour-of-meshy-tripo-and-threejs-5cic (GLB → Three.js bridging; auto-rig unreliable on non-humanoid A-pose inputs)
- trify3d, "Comparing AI 3D generators side by side" — https://dev.to/trify3d/comparing-ai-3d-generators-side-by-side-what-i-learned-building-a-multi-engine-tool-5373 (engine variance; regenerations not single-shot expectations)
