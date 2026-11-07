import type { InputState } from "./types";

function mapCode(code: string): "left" | "right" | "jump" | "action" | null {
  switch (code) {
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    case "Space":
    case "ArrowUp":
    case "KeyW":
      return "jump";
    case "Enter":
    case "KeyE":
      return "action";
    default:
      return null;
  }
}

export function createInputState(
  target: HTMLElement,
): InputState & { dispose(): void } {
  const held = new Set<string>();
  const state = {
    pointer: null as { x: number; y: number } | null,
    pressed(key: "left" | "right" | "jump" | "action") {
      return held.has(key);
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointerleave", onPointerUp);
    },
  };

  function onKeyDown(event: KeyboardEvent) {
    const mapped = mapCode(event.code);
    if (!mapped) return;
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
    }
    held.add(mapped);
  }

  function onKeyUp(event: KeyboardEvent) {
    const mapped = mapCode(event.code);
    if (mapped) held.delete(mapped);
  }

  function onPointerMove(event: PointerEvent) {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    state.pointer = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
    };
  }

  function onPointerDown(event: PointerEvent) {
    held.add("action");
    onPointerMove(event);
  }

  function onPointerUp() {
    held.delete("action");
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointerleave", onPointerUp);

  return state;
}
