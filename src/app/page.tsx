"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssetImageOverlay from "@/components/AssetImageOverlay";
import BuildProgress from "@/components/BuildProgress";
import GameCanvas from "@/components/GameCanvas";
import { PlanCard } from "@/components/PlanCard";
import UploadDropzone from "@/components/UploadDropzone";
import {
  getGeneration,
  postBuild,
  postPlan,
  postRegenerate,
} from "@/lib/client-api";
import type { GenerationView } from "@/lib/generation/state";
import type { ScenePlan } from "@/lib/planner/schema";

type Phase = "idle" | "planning" | "planned" | "building" | "ready";

const POLL_MS = 3000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function HomePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const [view, setView] = useState<GenerationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenLeft, setRegenLeft] = useState(3);
  const [setupMissing, setSetupMissing] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { ok?: boolean; missing?: string[] }) => {
        if (!body.ok && body.missing?.length) setSetupMissing(body.missing);
      })
      .catch(() => {
        // Health probe failing should never block the app.
      });
  }, []);

  // Debug entry: /?debugTemplate=hill_climb mounts a template with placeholders.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debug = params.get("debugTemplate");
    if (!debug) return;
    const allowed = [
      "hill_climb",
      "sports_ball",
      "endless_runner",
      "diorama_viewer",
    ] as const;
    if (!allowed.includes(debug as (typeof allowed)[number])) return;

    const debugPlan: ScenePlan = {
      sceneType: "debug scene",
      chosenGenre: debug as ScenePlan["chosenGenre"],
      genreReason: "Debug template run with placeholder assets.",
      confidence: 1,
      entities: [
        {
          slotId: "vehicle",
          label: "debug car",
          role: "vehicle",
          bbox: { x: 0.3, y: 0.4, w: 0.2, h: 0.2 },
          useForGeneration: true,
        },
        {
          slotId: "obstacle_1",
          label: "debug cone",
          role: "obstacle",
          bbox: { x: 0.6, y: 0.5, w: 0.1, h: 0.1 },
          useForGeneration: true,
        },
      ],
      palette: ["#dc2626", "#4d7c0f", "#eab308", "#0f172a"],
    };
    setPlan(debugPlan);
    setGenerationId("debug");
    setView({
      id: "debug",
      status: "ready",
      genre: debugPlan.chosenGenre,
      plan: debugPlan,
      assets: debugPlan.entities.map((entity) => ({
        slotId: entity.slotId,
        status: "placeholder",
      })),
    });
    setPhase("ready");
  }, []);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setTimeout(async () => {
        try {
          const next = await getGeneration(id);
          setView(next);
          if (next.status === "ready") {
            setPhase("ready");
            stopPolling();
            return;
          }
          if (next.status === "failed") {
            setError("The build failed. Try again or rethink the plan.");
            setPhase("planned");
            stopPolling();
            return;
          }
          poll(id);
        } catch (pollError) {
          setError(messageOf(pollError));
          poll(id);
        }
      }, POLL_MS);
    },
    [stopPolling],
  );

  const runPlan = useCallback(
    async (nextFile: File) => {
      stopPolling();
      setError(null);
      setView(null);
      setPlan(null);
      setGenerationId(null);
      setRegenLeft(3);
      setFile(nextFile);

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(nextFile);
      objectUrlRef.current = url;
      setImageUrl(url);
      setPhase("planning");

      try {
        const result = await postPlan(nextFile);
        setGenerationId(result.generationId);
        setPlan(result.plan);
        setPhase("planned");
      } catch (planError) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
        setImageUrl(null);
        setFile(null);
        setError(messageOf(planError));
        setPhase("idle");
      }
    },
    [stopPolling],
  );

  const build = async () => {
    if (!generationId) return;
    setError(null);
    setPhase("building");
    try {
      await postBuild(generationId);
      poll(generationId);
    } catch (buildError) {
      setError(messageOf(buildError));
      setPhase("planned");
    }
  };

  const regenerate = async (slotId: string) => {
    if (!generationId) return;
    setError(null);
    try {
      await postRegenerate(generationId, slotId);
      setRegenLeft((previous) => Math.max(0, previous - 1));
      setPhase("building");
      poll(generationId);
    } catch (regenerateError) {
      setError(messageOf(regenerateError));
    }
  };

  const reset = () => {
    stopPolling();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPhase("idle");
    setFile(null);
    setImageUrl(null);
    setGenerationId(null);
    setPlan(null);
    setView(null);
    setError(null);
    setRegenLeft(3);
  };

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>
            Anything <span className="arrow">→</span> Arcade
          </h1>
          <p>
            Upload a scene. We identify the game hiding in it, generate its 3D
            cast, and hand you the controller.
          </p>
        </div>
        <a className="ghost-link" href="/gallery">
          Gallery
        </a>
      </header>

      {setupMissing.length > 0 ? (
        <div className="setup-banner">
          Add <code>{setupMissing.join(" and ")}</code> to{" "}
          <code>.env.local</code> (see <code>.env.example</code>), then restart
          the dev server.
        </div>
      ) : null}

      {error ? (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      <main className="layout">
        <section className="stage">
          {imageUrl ? (
            <AssetImageOverlay imageUrl={imageUrl} plan={plan} />
          ) : (
            <UploadDropzone
              onFile={runPlan}
              disabled={phase === "planning"}
            />
          )}

          {phase === "planning" ? (
            <div className="thinking">
              <span className="spinner" /> Reading your scene…
            </div>
          ) : null}

          {(phase === "building" || phase === "ready") && view ? (
            <BuildProgress
              view={view}
              onRegenerate={regenerate}
              regenerationsLeft={regenLeft}
            />
          ) : null}

          {phase === "ready" && view ? (
            <GameCanvas view={view} imageUrl={imageUrl ?? undefined} />
          ) : null}

          {phase === "ready" ? (
            <button className="ghost make-another" onClick={reset}>
              Make another
            </button>
          ) : null}
        </section>

        <aside className="sidebar">
          {plan && phase === "planned" ? (
            <PlanCard
              plan={plan}
              onBuild={build}
              onRethink={() => file && runPlan(file)}
            />
          ) : null}

          {phase === "idle" ? (
            <div className="side-note">
              <h2>How it works</h2>
              <ol>
                <li>A vision model reads the scene and picks the genre.</li>
                <li>Tripo sculpts the cast (car, ball, props).</li>
                <li>A Three.js template stages the playable game.</li>
              </ol>
              <p>
                Sparse images are fine — a lone football gets goalposts added
                procedurally. Bad generations become placeholders, never
                blockers.
              </p>
            </div>
          ) : null}

          {phase === "ready" && view ? (
            <div className="side-note">
              <h2>{view.plan.sceneType}</h2>
              <p>{view.plan.genreReason}</p>
              <p className="fineprint">
                Controls: ← → steer · space jump/kick · hold pointer to aim on
                ball games.
              </p>
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
