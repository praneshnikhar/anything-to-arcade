"use client";

import { useEffect, useState } from "react";
import type * as THREE from "three";
import { loadAssets } from "@/game/engine/assetLoader";
import GameShell from "@/game/engine/GameShell";
import { extractHeightmap } from "@/game/heightmap";
import { templates } from "@/game/templates/registry";
import type { GenerationView } from "@/lib/generation/state";

async function heightmapFromImage(url: string): Promise<number[] | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const bitmap = await createImageBitmap(await response.blob());

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);

    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0; i < size * size; i += 1) {
      gray[i] =
        data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    }
    return extractHeightmap(gray, size, size, 48);
  } catch {
    return undefined;
  }
}

export default function GameCanvas({
  view,
  imageUrl,
}: {
  view: GenerationView;
  imageUrl: string;
}) {
  const [assets, setAssets] = useState<Map<string, THREE.Object3D> | null>(
    null,
  );
  const [heightmap, setHeightmap] = useState<number[] | undefined>(undefined);

  const template =
    templates[view.plan.chosenGenre] ?? templates.diorama_viewer;

  useEffect(() => {
    let cancelled = false;
    setAssets(null);
    loadAssets(view.assets, view.plan).then((loaded) => {
      if (!cancelled) setAssets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    if (view.plan.chosenGenre !== "hill_climb") {
      setHeightmap(undefined);
      return;
    }
    heightmapFromImage(imageUrl).then((map) => {
      if (!cancelled) setHeightmap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, view.plan.chosenGenre]);

  if (!assets) {
    return <div className="game-loading">Loading 3D assets…</div>;
  }

  return (
    <GameShell
      template={template}
      plan={view.plan}
      assets={assets}
      heightmap={heightmap}
    />
  );
}
