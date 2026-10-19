import * as THREE from "three";
import { center, elevation } from "./terrain";
import { cityBuildings, type CityBox } from "./city-layout";

// Window interiors give towers depth, dark floors and varied occupied rooms.
export function makeCityWindows() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#07101a";
  ctx.fillRect(0, 0, 256, 512);
  let seed = 87;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < 512; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const lit = random() > 0.38;
      ctx.fillStyle = lit
        ? ["#729ba7", "#c6c0a0", "#416e85", "#a6d4d8"][Math.floor(random() * 4)]
        : "#122332";
      ctx.fillRect(x + 2, y + 2, 11, 12);
      ctx.fillStyle = "#07121c";
      ctx.fillRect(x + 7, y + 2, 1, 12);
      if (lit && random() > 0.5) ctx.fillRect(x + 2, y + 9, 11, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Repeated building parts keep a deep skyline affordable while driving.
export function buildCity(index: number, column: number, windows: THREE.Texture) {
  const start = index * 160;
  const group = new THREE.Group();
  // Softer glass reflections keep tower faces clear from both driving directions.
  const glass = new THREE.MeshStandardMaterial({
    color: "#687f91", map: windows, emissiveMap: windows,
    emissive: "#aacbd9", emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.65,
  });
  // Keep window sizes consistent on short offices and tall towers.
  glass.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec2 facadeScale = vec2(length(instanceMatrix[0].xyz) / 24., length(instanceMatrix[1].xyz) / 64.);
        vMapUv *= facadeScale;
        vEmissiveMapUv *= facadeScale;
      #endif
    `);
  };
  const concrete = new THREE.MeshStandardMaterial({ color: "#25333f", metalness: 0.35, roughness: 0.65 });
  const cyan = new THREE.MeshStandardMaterial({ color: "#4ed5ea", emissive: "#18bde0", emissiveIntensity: 3 });
  const pink = new THREE.MeshStandardMaterial({ color: "#c67da6", emissive: "#e659a5", emissiveIntensity: 2.4 });
  // Brighter lamp faces match the soft light pools on the boulevard.
  const lamp = new THREE.MeshStandardMaterial({ color: "#d0e8ed", emissive: "#b2e1ff", emissiveIntensity: 4.2 });
  const batches = [glass, concrete, cyan, pink, lamp].map((material) => ({ material, matrices: [] as THREE.Matrix4[] }));
  const dummy = new THREE.Object3D();
  const solids: CityBox[] = [];
  const box = (batch: number, t: number, offset: number, y: number, w: number, h: number, d: number, solid = false) => {
    dummy.position.set(center(t) + offset, elevation(t) + y, -t);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    batches[batch].matrices.push(dummy.matrix.clone());
    if (solid) solids.push({ x: dummy.position.x, y: dummy.position.y, z: -t, w, h, d });
  };
  // Whole city blocks include visible streets, pavements and solid stepped roofs.
  for (const { t, offset, width, height, depth, accent } of cityBuildings(index, column)) {
    box(1, t, offset, -0.22, 44, 0.3, 34);
    box(1, t, offset, 1.4, width + 2, 2.8, depth + 2, true);
    box(0, t, offset, height / 2 + 2.8, width, height, depth, true);
    box(1, t, offset, height + 3.4, width + 0.6, 1.2, depth + 0.6, true);
    box(accent, t, offset, height + 4.1, width + 0.8, 0.2, depth + 0.8);
    box(0, t, offset, height + 7.5, width * 0.62, 7, depth * 0.62, true);
    box(1, t, offset, height + 12.5, 4, 3, 5, true);
    box(accent, t, offset - Math.sign(offset) * (width / 2 + 0.1), height / 2 + 3, 0.16, height, 0.25);
    // Street level stays detailed; distant towers use fewer parts for smooth flight.
    if (Math.abs(offset) < 100) {
      for (let floor = 12; floor < height; floor += 20)
        box(1, t, offset, floor + 3, width + 0.3, 0.35, depth + 0.3);
      box(accent, t - depth / 2 - 0.2, offset, 5.5, width * 0.65, 0.7, 0.18);
    }
    box(4, t - 17, offset + 21, 0.1, 0.25, 0.12, 3);
  }
  // Asphalt fills each district, including the areas beyond the highway terrain.
  const left = column >= 0 ? Math.max(23, column * 208 + 14) : column * 208 - 14;
  const right = column >= 0 ? (column + 1) * 208 + 14 : Math.min(-23, (column + 1) * 208 - 14);
  const positions: number[] = [];
  for (let t = start; t < start + 160; t += 8) {
    const a = [center(t) + left, elevation(t) - 0.4, -t];
    const b = [center(t) + right, elevation(t) - 0.4, -t];
    const c = [center(t + 8) + left, elevation(t + 8) - 0.4, -t - 8];
    const d = [center(t + 8) + right, elevation(t + 8) - 0.4, -t - 8];
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const ground = new THREE.BufferGeometry();
  ground.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  ground.computeVertexNormals();
  group.add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ color: "#121e29", roughness: 0.7 })));
  // Lamp poles and arms stop the car at their visible edges; side streets remain visible from the air.
  if (column === 0 || column === -1) {
    const side = column === 0 ? 1 : -1;
    for (let t = start + 12; t < start + 160; t += 32) {
      box(1, t, side * 16, 5.5, 0.18, 11, 0.18, true);
      box(1, t, side * 14.5, 11, 3.2, 0.16, 0.22, true);
      box(4, t, side * 13.3, 10.9, 1.3, 0.1, 0.5, true);
    }
  }
  group.userData.solids = solids;
  for (const { material, matrices } of batches) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = material === concrete;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// A cheaper outer skyline fills the distant view when flying high above the loaded streets.
export function buildCityHorizon(row: number, column: number, windows: THREE.Texture) {
  const group = new THREE.Group();
  const matrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let z = row - 17; z <= row + 17; z++) {
    for (let x = column - 13; x <= column + 13; x++) {
      if (Math.abs(z - row) <= 7 && Math.abs(x - column) <= 5) continue;
      for (const [i, b] of cityBuildings(z, x).entries()) {
        if (i % 2 || Math.floor(i / 4) % 2) continue;
        dummy.position.set(center(b.t) + b.offset, elevation(b.t) + b.height / 2, -b.t);
        dummy.scale.set(b.width * 1.5, b.height, b.depth * 1.5);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
      }
    }
  }
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({
    color: "#263d4c", map: windows, emissiveMap: windows,
    emissive: "#3c6c81", emissiveIntensity: 0.3, roughness: 0.65,
  }), matrices.length);
  matrices.forEach((matrix, i) => towers.setMatrixAt(i, matrix));
  group.add(towers);
  // A low, wide base hides district edges when looking down from above the skyline.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120000, 120000),
    new THREE.MeshStandardMaterial({ color: "#111e29", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center(row * 160) + column * 208, -30, -row * 160);
  group.add(ground);
  return group;
}
