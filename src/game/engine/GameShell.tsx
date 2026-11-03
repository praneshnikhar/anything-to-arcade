"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ScenePlan } from "@/lib/planner/schema";
import { createInputState } from "./controls";
import { fixedSteps } from "./loop";
import type { GameTemplate } from "./types";

interface GameShellProps {
  template: GameTemplate;
  plan: ScenePlan;
  assets: Map<string, THREE.Object3D>;
  heightmap?: number[];
}

export default function GameShell({
  template,
  plan,
  assets,
  heightmap,
}: GameShellProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scoreRef = useRef<HTMLSpanElement | null>(null);
  const overRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(plan.palette[3] ?? "#0f172a");

    const camera = new THREE.PerspectiveCamera(
      55,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.1,
      800,
    );
    camera.position.set(0, 3.2, 8);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    scene.add(sun);

    const input = createInputState(renderer.domElement);
    const instance = template.create({
      plan,
      assets,
      scene,
      input,
      palette: plan.palette,
      heightmap,
    });

    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let hudTimer = 0;

    const frame = (now: number) => {
      const elapsed = now - last;
      last = now;
      accumulator += elapsed;

      const steps = fixedSteps(accumulator);
      if (steps > 0) {
        accumulator -= steps * 16.6667;
        for (let i = 0; i < steps; i += 1) {
          instance.update(16.6667 / 1000);
        }
      }

      renderer.render(scene, camera);

      hudTimer += elapsed;
      if (hudTimer > 250) {
        hudTimer = 0;
        if (scoreRef.current) {
          scoreRef.current.textContent = String(Math.round(instance.score()));
        }
        if (overRef.current) {
          overRef.current.style.display = instance.isOver() ? "flex" : "none";
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      input.dispose();
      instance.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [template, plan, assets, heightmap]);

  return (
    <div className="game-shell" ref={hostRef}>
      <div className="game-hud">
        Score <span ref={scoreRef}>0</span>
      </div>
      <div className="game-over" ref={overRef} style={{ display: "none" }}>
        Run over
      </div>
    </div>
  );
}
