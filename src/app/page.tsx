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
const REGEN_PER_SLOT = 3;

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
  const [regenLeft, setRegenLeft] = useState<Record<string, number>>({});

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!view) return;
    setRegenLeft((previous) => {
      const next = { ...previous };
      for (const asset of view.assets) {
        if (next[asset.slotId] === undefined) next[asset.slotId] = REGEN_PER_SLOT;
      }
      return next;
    });
  }, [view]);

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
      setRegenLeft({});
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
      setRegenLeft((previous) => ({
        ...previous,
        [slotId]: Math.max(0, (previous[slotId] ?? REGEN_PER_SLOT) - 1),
      }));
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
    setRegenLeft({});
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

          {phase === "ready" && view && imageUrl ? (
            <GameCanvas view={view} imageUrl={imageUrl} />
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
