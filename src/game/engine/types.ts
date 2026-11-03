import type * as THREE from "three";
import type { Genre } from "@/lib/planner/genres";
import type { ScenePlan } from "@/lib/planner/schema";

export interface InputState {
  pressed(key: "left" | "right" | "jump" | "action"): boolean;
  pointer: { x: number; y: number } | null;
}

export interface TemplateContext {
  plan: ScenePlan;
  assets: Map<string, THREE.Object3D>;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  domElement: HTMLCanvasElement;
  input: InputState;
  palette: string[];
  heightmap?: number[];
}

export interface TemplateInstance {
  update(dt: number): void;
  restart(): void;
  score(): number;
  isOver(): boolean;
  dispose(): void;
}

export interface GameTemplate {
  id: Genre;
  create(ctx: TemplateContext): TemplateInstance;
}
