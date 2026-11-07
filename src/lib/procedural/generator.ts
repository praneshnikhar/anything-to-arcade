import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { maskFromBuffer } from "./mask";
import { traceOutline } from "./outline";

// GLTFExporter writes binary via the browser FileReader API, which Node lacks.
function installFileReaderPolyfill(): void {
  if (typeof globalThis.FileReader !== "undefined") return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  (globalThis as Record<string, unknown>).FileReader = NodeFileReader;
}
installFileReaderPolyfill();

export interface GenerateMeshOptions {
  role: string;
  palette: string[];
}

const ROLE_COLOR_INDEX: Record<string, number> = {
  ball: 1,
  hero: 0,
  vehicle: 0,
  obstacle: 0,
  scenery: 2,
};

/**
 * Build a binary glTF (.glb) by extruding the entity's silhouette into a
 * flat "cutout" prism. Free, local, instant — no generative model needed.
 */
export async function generateMesh(
  crop: Buffer,
  options: GenerateMeshOptions,
): Promise<Buffer> {
  const { data, width, height } = await maskFromBuffer(crop);
  const contour = traceOutline(data, width, height);

  if (contour.length < 3) {
    // No detectable subject — fall back to a simple card.
    return buildGlb(
      [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      width,
      height,
      options,
    );
  }

  return buildGlb(contour, width, height, options);
}

async function buildGlb(
  contour: number[][],
  width: number,
  height: number,
  options: GenerateMeshOptions,
): Promise<Buffer> {
  const xs = contour.map((point) => point[0]);
  const ys = contour.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const scale = 1 / boxWidth;

  const shape = new THREE.Shape();
  contour.forEach(([x, y], index) => {
    const px = (x - minX) * scale - 0.5;
    const py = (maxY - y) * scale; // flip so the subject stands upright
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();

  const depth = Math.max(0.15, (boxHeight / boxWidth) * 0.35);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geometry.computeVertexNormals();

  const color =
    options.palette[ROLE_COLOR_INDEX[options.role] ?? 0] ?? "#7dd3fc";
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));

  const exporter = new GLTFExporter();
  const arrayBuffer = (await exporter.parseAsync(scene, {
    binary: true,
  })) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
