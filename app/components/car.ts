import * as THREE from "three";
import type { GasOutlet } from "./exhaust";

/** Original model shaped from the supplied Roadster rear-view reference. */
export function makeCar() {
  const car = new THREE.Group();
  car.rotation.order = "YXZ";
  const outlets: GasOutlet[] = [];
  const wheels: THREE.Group[] = [];
  const frontWheels: THREE.Group[] = [];
  const silver = new THREE.MeshPhysicalMaterial({
    color: "#c2c6c8",
    metalness: 0.82,
    roughness: 0.23,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.3,
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: "#11161b",
    metalness: 0.4,
    roughness: 0.36,
  });
  const black = new THREE.MeshStandardMaterial({
    color: "#06090c",
    roughness: 0.65,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#07131b",
    metalness: 0.48,
    roughness: 0.11,
    clearcoat: 1,
    envMapIntensity: 1.2,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: "#7e878c",
    metalness: 0.95,
    roughness: 0.24,
  });
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D = car,
  ) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = carbon,
  ) {
    const m = mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    return m;
  }
  function loft(rings: number[][], material: THREE.Material) {
    const p: number[] = [],
      indices: number[] = [];
    for (const [z, w, b, t] of rings) {
      // Keep bevels inside thin sections at the wheel arches and glass edges.
      const lowerBevel = Math.min(0.045, (t - b) * 0.2);
      const upperBevel = Math.min(0.12, (t - b) * 0.4);
      p.push(
        -w * 0.9,
        b,
        z,
        -w,
        b + lowerBevel,
        z,
        -w,
        t - upperBevel,
        z,
        -w * 0.74,
        t,
        z,
        w * 0.74,
        t,
        z,
        w,
        t - upperBevel,
        z,
        w,
        b + lowerBevel,
        z,
        w * 0.9,
        b,
        z,
      );
    }
    for (let row = 0; row < rings.length - 1; row++)
      for (let j = 0; j < 8; j++) {
        const a = row * 8 + j,
          b = row * 8 + ((j + 1) % 8);
        indices.push(a, a + 8, b, b, a + 8, b + 8);
      }
    for (let j = 1; j < 7; j++) {
      indices.push(0, j, j + 1);
      const n = (rings.length - 1) * 8;
      indices.push(n, n + j + 1, n + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return mesh(g, material);
  }
  const sections = [
    [-2.43, 0.81, 0.62],
    [-2.12, 0.99, 0.73],
    [-1.86, 1.04, 0.84],
    [-1.64, 1.07, 0.89],
    [-1.42, 1.08, 0.92],
    [-1.18, 1.06, 0.9],
    [-0.96, 1.03, 0.87],
    [-0.5, 1.0, 0.87],
    [0.45, 1.02, 0.88],
    [0.9, 1.07, 0.93],
    [1.15, 1.1, 0.97],
    [1.35, 1.11, 0.99],
    [1.6, 1.1, 0.97],
    [1.82, 1.08, 0.95],
    [2.25, 1.02, 0.96],
  ];
  loft(
    sections.map(([z, w, top]) => {
      const delta = Math.min(Math.abs(z + 1.42), Math.abs(z - 1.35));
      const arch =
        delta < 0.46 ? 0.41 + Math.sqrt(0.46 * 0.46 - delta * delta) : 0.29;
      return [z, w, Math.min(top - 0.08, arch), top];
    }),
    silver,
  );
  box(1.63, 0.13, 3.9, 0, 0.27, 0, carbon);
  loft(
    [
      [-1.02, 0.78, 0.8, 0.84],
      [-0.32, 0.66, 0.82, 1.28],
      [0.54, 0.64, 0.83, 1.32],
      [1.52, 0.78, 0.84, 0.93],
    ],
    glass,
  );
  // Sculpted C-pillars join the canopy to the rear shoulders; no roof bar.
  for (const side of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          side * 0.64,
          1.32,
          0.54,
          side * 0.84,
          0.91,
          0.25,
          side * 1.02,
          0.94,
          1.96,
          side * 0.64,
          1.32,
          0.54,
          side * 1.02,
          0.94,
          1.96,
          side * 0.76,
          0.93,
          1.52,
        ],
        3,
      ),
    );
    g.computeVertexNormals();
    const mat = silver.clone();
    mat.side = THREE.DoubleSide;
    mesh(g, mat);
    const sill = box(0.1, 0.14, 1.9, side * 1.01, 0.31, -0.01);
    sill.rotation.z = side * 0.08;
    box(0.18, 0.075, 0.25, side * 1.05, 0.96, -0.55, silver);
    // Fine door shut lines and flush handles.
    box(0.012, 0.012, 1.35, side * 1.014, 0.7, -0.1, carbon);
    box(0.013, 0.026, 0.18, side * 1.024, 0.77, 0.3, carbon);
  }
  // Thin full-width red light in a black inset, like the supplied rear view.
  box(2.02, 0.12, 0.045, 0, 0.91, 2.275, carbon);
  const light = new THREE.MeshStandardMaterial({
    color: "#e52b2e",
    emissive: "#ff171b",
    emissiveIntensity: 3,
    toneMapped: false,
  });
  box(1.96, 0.027, 0.012, 0, 0.925, 2.306, light);
  box(
    1.93,
    0.009,
    0.014,
    0,
    0.897,
    2.305,
    new THREE.MeshStandardMaterial({
      color: "#c0151e",
      emissive: "#e11825",
      emissiveIntensity: 0.7,
    }),
  );
  const wing = box(2.01, 0.027, 0.14, 0, 0.98, 2.18, silver);
  // Recessed black diffuser and small pressure outlets, not oversized fans.
  box(1.92, 0.49, 0.17, 0, 0.48, 2.21, black);
  box(1.48, 0.3, 0.06, 0, 0.39, 2.31, carbon);
  box(1.31, 0.23, 0.025, 0, 0.43, 2.35, black);
  for (const x of [-0.68, -0.34, 0, 0.34, 0.68])
    box(0.025, 0.22, 0.35, x, 0.27, 2.22, carbon);
  box(1.5, 0.045, 0.22, 0, 0.19, 2.26, carbon);
  for (const side of [-1, 1]) {
    const bumper = box(0.18, 0.43, 0.19, side * 0.94, 0.48, 2.19, silver);
    bumper.rotation.z = -side * 0.12;
    box(0.035, 0.012, 0.025, side * 1.01, 0.72, 2.27, light);
  }
  for (const x of [-0.44, -0.147, 0.147, 0.44]) {
    const rim = mesh(new THREE.TorusGeometry(0.043, 0.008, 8, 20), chrome);
    rim.position.set(x, 0.6, 2.34);
    const bore = mesh(new THREE.CircleGeometry(0.036, 20), black);
    bore.position.set(x, 0.6, 2.342);
    outlets.push({
      position: new THREE.Vector3(x, 0.6, 2.36),
      direction: new THREE.Vector3(0, 0, 1),
      kind: "boost",
      torque: 0,
      carry: 0,
    });
  }
  const plateCanvas = document.createElement("canvas");
  plateCanvas.width = 256;
  plateCanvas.height = 128;
  const ctx = plateCanvas.getContext("2d")!;
  ctx.fillStyle = "#97a3a7";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#d7dfe0";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = "#e4e8e7";
  ctx.font = "56px monospace";
  ctx.textAlign = "center";
  ctx.fillText("RDSTR", 128, 85);
  ctx.fillStyle = "#545d62";
  ctx.fillRect(25, 12, 8, 8);
  ctx.fillRect(223, 12, 8, 8);
  const plateTexture = new THREE.CanvasTexture(plateCanvas);
  plateTexture.colorSpace = THREE.SRGBColorSpace;
  const plate = box(
    0.34,
    0.17,
    0.025,
    0,
    0.76,
    2.34,
    new THREE.MeshStandardMaterial({
      map: plateTexture,
      roughness: 0.45,
      metalness: 0.3,
    }),
  );
  plate.userData.ownedTexture = plateTexture;
  for (const side of [-1, 1])
    for (const z of [-1.42, 1.35]) {
      const axle = new THREE.Group();
      axle.position.set(side * 0.98, 0.41, z);
      car.add(axle);
      if (z < 0) frontWheels.push(axle);
      const wheel = new THREE.Group();
      axle.add(wheel);
      wheels.push(wheel);
      const tire = mesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.23, 40),
        new THREE.MeshStandardMaterial({ color: "#111315", roughness: 0.92 }),
        wheel,
      );
      tire.rotation.z = Math.PI / 2;
      const disc = mesh(
        new THREE.CylinderGeometry(0.275, 0.275, 0.018, 32),
        carbon,
        wheel,
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.x = side * 0.124;
      const rim = mesh(
        new THREE.TorusGeometry(0.27, 0.017, 8, 32),
        chrome,
        wheel,
      );
      rim.rotation.y = Math.PI / 2;
      rim.position.x = side * 0.139;
      for (let i = 0; i < 5; i++) {
        const spoke = mesh(
            new THREE.BoxGeometry(0.025, 0.046, 0.25),
            chrome,
            wheel,
          ),
          a = (i * Math.PI * 2) / 5;
        spoke.position.set(
          side * 0.141,
          Math.sin(a) * 0.13,
          Math.cos(a) * 0.13,
        );
        spoke.rotation.x = -a;
      }
      const hub = mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.024, 16),
        chrome,
        wheel,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.15;
      const caliper = box(
        0.035,
        0.12,
        0.075,
        side * 1.1,
        0.46,
        z + 0.18,
        new THREE.MeshStandardMaterial({ color: "#87352b", roughness: 0.5 }),
      );
      caliper.castShadow = false;
      axle.attach(caliper);
    }
  box(1.65, 0.045, 0.19, 0, 0.3, -2.31, carbon);
  const headlight = new THREE.MeshStandardMaterial({
    color: "#e1efff",
    emissive: "#b9d5ff",
    emissiveIntensity: 1.5,
  });
  for (const side of [-1, 1]) {
    const lamp = box(0.53, 0.025, 0.025, side * 0.54, 0.655, -2.405, headlight);
    lamp.rotation.z = side * 0.06;
  }
  for (const x of [-0.78, 0.78])
    for (const z of [-1.2, 1.4]) {
      const nozzle = mesh(
        new THREE.CylinderGeometry(0.075, 0.09, 0.12, 16),
        carbon,
      );
      nozzle.position.set(x, 0.23, z);
      outlets.push({
        position: nozzle.position.clone(),
        direction: new THREE.Vector3(0, -1, 0),
        kind: "lift",
        torque: 0,
        nozzle,
        carry: 0,
      });
    }
  for (const side of [-1, 1])
    for (const torque of [-1, 1])
      for (const z of [-1.25, 1.25]) {
        const direction = new THREE.Vector3(
            side * 0.7,
            -side * torque,
            0,
          ).normalize(),
          position = new THREE.Vector3(
            side * 1.1,
            0.55 - side * torque * 0.1,
            z,
          );
        const nozzle = mesh(
          new THREE.CylinderGeometry(0.04, 0.05, 0.05, 12),
          carbon,
        );
        nozzle.position.copy(position);
        nozzle.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction,
        );
        outlets.push({ position, direction, kind: "roll", torque, carry: 0 });
      }
  // Front and rear lateral jets fire as a couple: equal force, opposite
  // moment arms. Reverse the pair for right turns and yaw braking.
  for (const side of [-1, 1])
    for (const z of [-1.35, 1.35]) {
      const position = new THREE.Vector3(side * 1.115, 0.69, z),
        direction = new THREE.Vector3(side, 0, 0);
      const nozzle = mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.04, 12),
        carbon,
      );
      nozzle.position.copy(position);
      nozzle.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
      outlets.push({
        position,
        direction,
        kind: "yaw",
        torque: -Math.sign(z) * side,
        carry: 0,
      });
    }
  return { car, outlets, wing, wheels, frontWheels };
}

/** Positive angles steer left; the inside front tire turns more tightly. */
export function steerFrontWheels(frontWheels: THREE.Group[], angle: number) {
  const tangent = Math.tan(angle);
  for (const axle of frontWheels)
    axle.rotation.y = Math.atan2(
      2.77 * tangent,
      2.77 + axle.position.x * tangent,
    );
}
