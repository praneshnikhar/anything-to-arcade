import * as THREE from "three";

export function createPlaceholder(
  role: string,
  palette: string[],
): THREE.Object3D {
  const color = new THREE.Color(
    palette[role === "ball" ? 1 % Math.max(1, palette.length) : 0] ??
      "#7dd3fc",
  );
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.1,
  });

  let mesh: THREE.Mesh;
  switch (role) {
    case "ball":
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), material);
      break;
    case "vehicle":
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.9), material);
      break;
    case "terrain":
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), material);
      mesh.rotation.x = -Math.PI / 2;
      break;
    case "obstacle":
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 16), material);
      break;
    case "hero":
      mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 0.8, 6, 12),
        material,
      );
      break;
    default:
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), material);
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `placeholder-${role}`;
  return mesh;
}
