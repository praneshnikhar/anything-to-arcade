"use client";

import type { EntityRole, ScenePlan } from "@/lib/planner/schema";

export const GENRE_LABELS: Record<string, string> = {
  hill_climb: "Hill-Climb Racer",
  sports_ball: "Ball Sports",
  endless_runner: "Endless Runner",
  diorama_viewer: "3D Diorama",
};

const ROLE_ICONS: Record<EntityRole, string> = {
  hero: "🧍",
  vehicle: "🚗",
  ball: "⚽",
  obstacle: "🚧",
  scenery: "🌳",
  terrain: "🏔️",
};

export function PlanCard({
  plan,
  onBuild,
  onRethink,
  busy,
}: {
  plan: ScenePlan;
  onBuild: () => void;
  onRethink: () => void;
  busy?: boolean;
}) {
  const label = GENRE_LABELS[plan.chosenGenre] ?? plan.chosenGenre;

  return (
    <section className="plan-card">
      <div className="plan-heading">
        <span className="genre-badge">{label}</span>
        <span className="confidence">
          {Math.round(plan.confidence * 100)}% match
        </span>
      </div>

      <p className="plan-reason">{plan.genreReason}</p>

      <div className="entity-chips">
        {plan.entities.map((entity) => (
          <span className="entity-chip" key={entity.slotId}>
            {ROLE_ICONS[entity.role]} {entity.label}
            {entity.useForGeneration ? "" : " · scene"}
          </span>
        ))}
      </div>

      <div className="plan-actions">
        <button className="primary" onClick={onBuild} disabled={busy}>
          Build it →
        </button>
        <button className="ghost" onClick={onRethink} disabled={busy}>
          Rethink
        </button>
      </div>
      <p className="plan-fineprint">
        Rethink re-reads the image (free). Build it spends Tripo credits.
      </p>
    </section>
  );
}
