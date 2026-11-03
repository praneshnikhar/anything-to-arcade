"use client";

import type { ScenePlan } from "@/lib/planner/schema";

export default function AssetImageOverlay({
  imageUrl,
  plan,
}: {
  imageUrl: string;
  plan: ScenePlan | null;
}) {
  return (
    <div className="image-overlay">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Uploaded scene" />
      {plan
        ? plan.entities
            .filter((entity) => entity.useForGeneration)
            .map((entity) => (
              <span
                key={entity.slotId}
                className="bbox"
                style={{
                  left: `${entity.bbox.x * 100}%`,
                  top: `${entity.bbox.y * 100}%`,
                  width: `${entity.bbox.w * 100}%`,
                  height: `${entity.bbox.h * 100}%`,
                }}
              >
                <span className="bbox-label">{entity.slotId}</span>
              </span>
            ))
        : null}
    </div>
  );
}
