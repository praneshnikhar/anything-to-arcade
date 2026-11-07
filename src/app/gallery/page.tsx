"use client";

import { useEffect, useState } from "react";
import GameCanvas from "@/components/GameCanvas";
import {
  getGallery,
  getGeneration,
  type GalleryItem,
} from "@/lib/client-api";
import type { GenerationView } from "@/lib/generation/state";
import { GENRE_LABELS } from "@/components/PlanCard";

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{
    view: GenerationView;
    imageUrl: string;
  } | null>(null);

  useEffect(() => {
    getGallery()
      .then((result) => setItems(result.items))
      .catch((galleryError) =>
        setError(
          galleryError instanceof Error
            ? galleryError.message
            : "Could not load the gallery.",
        ),
      );
  }, []);

  const openItem = async (item: GalleryItem) => {
    try {
      const view = await getGeneration(item.id);
      setOpen({ view, imageUrl: item.imageUrl });
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Could not open that run.",
      );
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Gallery</h1>
          <p>Every scene this machine has turned into a game.</p>
        </div>
        <a className="ghost-link" href="/">
          New run
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

      {open ? (
        <section className="stage">
          <div className="gallery-open-head">
            <span className="genre-badge">
              {GENRE_LABELS[open.view.plan.chosenGenre] ??
                open.view.plan.chosenGenre}
            </span>
            <button className="ghost" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <GameCanvas view={open.view} imageUrl={open.imageUrl} />
        </section>
      ) : null}

      {!items ? (
        <div className="thinking">
          <span className="spinner" /> Loading gallery…
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          Nothing here yet. <a href="/">Build the first game.</a>
        </div>
      ) : (
        <ul className="gallery-grid">
          {items.map((item) => (
            <li key={item.id}>
              <button className="gallery-card" onClick={() => openItem(item)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl} alt="" />
                <span className="gallery-meta">
                  <strong>{GENRE_LABELS[item.genre] ?? item.genre}</strong>
                  <span>{item.status}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
