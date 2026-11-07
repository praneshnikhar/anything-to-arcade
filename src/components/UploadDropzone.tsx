"use client";

import { useRef, useState } from "react";

export default function UploadDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}${
        disabled ? " disabled" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !disabled) inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <div className="dropzone-icon">🖼️ → 🎮</div>
      <strong>Drop an image, get a game</strong>
      <span>
        A drawing, a photo, a hill-climb sketch, a football on grass — we
        figure out which game it should be.
      </span>
      <span className="dropzone-hint">PNG · JPEG · WebP · GIF · up to 10 MB</span>
    </div>
  );
}
