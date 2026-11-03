"use client";

import type { GenerationView } from "@/lib/generation/state";

const STATUS_COPY: Record<string, string> = {
  pending: "queued",
  uploading: "uploading crop",
  generating: "sculpting",
  downloading: "downloading",
  ready: "ready",
  placeholder: "placeholder",
  failed: "failed",
};

export default function BuildProgress({
  view,
  onRegenerate,
  regenerationsLeft,
}: {
  view: GenerationView;
  onRegenerate: (slotId: string) => void;
  regenerationsLeft: number;
}) {
  const total = view.assets.length || 1;
  const done = view.assets.filter(
    (asset) => asset.status === "ready" || asset.status === "placeholder",
  ).length;
  const percent = Math.round((done / total) * 100);

  return (
    <section className="progress-card">
      <div className="progress-heading">
        <strong>
          {view.status === "ready"
            ? "Staged — ready to play"
            : "Building your game…"}
        </strong>
        <span>{percent}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <ul className="asset-list">
        {view.assets.map((asset) => (
          <li key={asset.slotId}>
            <span className={`dot ${asset.status}`} />
            <span className="asset-slot">{asset.slotId}</span>
            <span className="asset-status">
              {STATUS_COPY[asset.status] ?? asset.status}
              {asset.error ? ` · ${asset.error}` : ""}
            </span>
            <button
              className="mini"
              disabled={
                view.status !== "ready" || regenerationsLeft <= 0
              }
              onClick={() => onRegenerate(asset.slotId)}
            >
              Regenerate ({regenerationsLeft})
            </button>
          </li>
        ))}
      </ul>

      <p className="progress-hint">
        {view.status === "ready"
          ? "Everything staged. Play below."
          : "Rendering takes ~1–2 min per asset on Tripo. Placeholders keep the game playable if a slot fails."}
      </p>
    </section>
  );
}
