import * as THREE from "three";
import { makeCar, steerFrontWheels } from "./car";
import {
  center,
  elevation,
  ground,
  terrainOffsets,
  drivingSurface,
} from "./terrain";
import { resolveGuardrail } from "./guardrail";
import { createExhaust, rollJetDemand, yawJetDemand } from "./exhaust";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  makeSky,
  makeOcean,
  makeSurfaceTexture,
  makePineGeometry,
  makeVegetationTexture,
  makeStoneTexture,
  makeBroadleafGeometry,
  makeGrassGeometry,
  makeNormalMap,
  makeBranchGeometry,
} from "./scenery";

export type Environment = "countryside" | "coast" | "alpine" | "desert";
export type Daytime = "day" | "sunset" | "night";
export type Telemetry = {
  speed: number;
  distance: number;
  altitude: number;
  charge: number;
  flying?: boolean;
  thrust?: number;
  boosting?: boolean;
  flipping?: boolean;
  surface?: "road" | "offroad";
};
export type Controls = {
  flying: boolean;
  cruise: boolean;
  paused: boolean;
  boost: boolean;
  camera: number;
  environment: Environment;
  daytime: Daytime;
  keys: Set<string>;
  reset: number;
  recover: number;
  chargeLocked?: boolean;
  flip: number;
};
const palettes = {
  countryside: {
    ground: "#7d9553",
    dark: "#6f884c",
    water: "#8db9bc",
    sky: "#83b5e5",
  },
  coast: {
    ground: "#738260",
    dark: "#47573c",
    water: "#8db9bc",
    sky: "#c3d7db",
  },
  alpine: {
    ground: "#879f8d",
    dark: "#4d6c60",
    water: "#9bbfc7",
    sky: "#b9ced7",
  },
  desert: {
    ground: "#d3b18c",
    dark: "#b68c6a",
    water: "#c9b999",
    sky: "#d8d0c6",
  },
};
const fract = (n: number) => n - Math.floor(n);
const random = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
function strip(points: number[], color: THREE.ColorRepresentation) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
}
function ribbon(
  start: number,
  length: number,
  left: number,
  right: number,
  color: string,
  raise = 0.04,
) {
  const points: number[] = [];
  for (let t = start; t < start + length; t += 4) {
    const end = Math.min(t + 4, start + length);
    const a = [center(t) + left, elevation(t) + raise, -t];
    const b = [center(t) + right, elevation(t) + raise, -t];
    const c = [center(end) + left, elevation(end) + raise, -end];
    const d = [center(end) + right, elevation(end) + raise, -end];
    points.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  return strip(points, color);
}
export function createWorld(
  container: HTMLDivElement,
  controls: Controls,
  report: (data: Telemetry) => void,
) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const grassTexture = makeSurfaceTexture("grass");
  const roadTexture = makeSurfaceTexture("asphalt");
  const foliageTexture = makeVegetationTexture();
  const meadowTexture = new THREE.TextureLoader().load(
    "/textures/meadow-grass.png",
  );
  meadowTexture.colorSpace = THREE.SRGBColorSpace;
  meadowTexture.wrapS = meadowTexture.wrapT = THREE.RepeatWrapping;
  meadowTexture.repeat.set(8, 8);
  meadowTexture.anisotropy = 16;
  const broadleafTexture = new THREE.TextureLoader().load(
    "/textures/oak-foliage.png",
  );
  broadleafTexture.colorSpace = THREE.SRGBColorSpace;
  broadleafTexture.anisotropy = 8;
  const grassNormal = makeNormalMap(grassTexture, 1.8);
  const roadNormal = makeNormalMap(roadTexture, 1.4);
  const stoneTexture = makeStoneTexture();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const reflections = pmrem.fromScene(room, 0.04);
  scene.environment = reflections.texture;
  scene.environmentIntensity = 0.35;
  room.dispose();
  pmrem.dispose();
  container.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(
    52,
    container.clientWidth / container.clientHeight,
    0.1,
    2400,
  );
  const ambient = new THREE.HemisphereLight("#eff3ed", "#6b7766", 2.5);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff3dc", 3.2);
  sun.position.set(-120, 38, -220);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -65;
  sun.shadow.camera.right = sun.shadow.camera.top = 65;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.normalBias = 0.08;
  sun.shadow.bias = -0.00015;
  scene.add(sun.target);
  scene.add(sun);
  const sky = makeSky();
  scene.add(sky);
  const water = makeOcean();
  water.rotation.x = -Math.PI / 2;
  water.position.y = -5;
  scene.add(water);
  const { car, outlets, wing, wheels, frontWheels } = makeCar();
  const exhaust = createExhaust(scene);
  const previousCarPosition = new THREE.Vector3();
  const contactPoint = new THREE.Vector3();
  const groundContacts = [
    ...[-0.98, 0.98].flatMap((x) =>
      [-1.42, 1.35].flatMap((z) =>
        [-0.115, 0.115].flatMap((edge) =>
          Array.from(
            { length: 8 },
            (_, i) =>
              new THREE.Vector3(
                x + edge,
                0.41 + Math.cos((i * Math.PI) / 4) * 0.39,
                z + Math.sin((i * Math.PI) / 4) * 0.39,
              ),
          ),
        ),
      ),
    ),
    ...[-0.95, 0, 0.95].flatMap((x) =>
      [-2.18, 0, 2.22].map((z) => new THREE.Vector3(x, 0.27, z)),
    ),
  ];
  const exhaustVelocity = new THREE.Vector3();
  let hasCarPosition = false;
  let boosting = false;
  let chaseLookAhead = 4,
    chaseLookHeight = 0.7;
  scene.add(car);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: "#27382e",
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.35, 2.8, 1);
  scene.add(shadow);
  let environment = controls.environment,
    daytime: Daytime | undefined;
  let chunks = new Map<number, THREE.Group>();
  const exhaustSurfaceHeight = (x: number, z: number) => {
    const height = drivingSurface(-z, x, environment);
    return environment === "coast" ? Math.max(-5, height) : height;
  };
  const disposeGroup = (g: THREE.Object3D) => {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.userData.ownedTexture instanceof THREE.Texture)
          o.userData.ownedTexture.dispose();
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    scene.remove(g);
  };
  function buildChunk(index: number) {
    const group = new THREE.Group();
    const start = index * 160;
    const p = palettes[environment];
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const offsets = terrainOffsets;
    const base = new THREE.Color(
        environment === "countryside" ? "#d3d0b5" : p.ground,
      ),
      dark = new THREE.Color(
        environment === "countryside" ? "#a9b494" : p.dark,
      );
    const width = offsets.length;
    for (let row = 0; row <= 20; row++) {
      const t = start + row * 8;
      offsets.forEach((x, col) => {
        const height = ground(t, x, environment);
        positions.push(center(t) + x, height, -t);
        uvs.push((center(t) + x) / 24, -t / 24);
        const blend =
          0.22 +
          0.2 *
            Math.sin(x * 0.031 + t * 0.014) *
            Math.sin(t * 0.037 - x * 0.013);
        const color = base.clone().lerp(dark, blend);
        if (environment === "alpine" && height > 75)
          color.lerp(
            new THREE.Color("#e8e8e3"),
            Math.min(1, (height - 75) / 50),
          );
        colors.push(color.r, color.g, color.b);
        if (row < 20 && col < width - 1) {
          const a = row * width + col;
          indices.push(a, a + 1, a + width, a + 1, a + width + 1, a + width);
        }
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: environment === "countryside" ? meadowTexture : grassTexture,
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 1,
      }),
    );
    terrain.receiveShadow = true;
    group.add(terrain);
    group.add(ribbon(start, 160, -4, 4, "#a7aaa0", 0.02));
    const road = ribbon(
      start,
      160,
      -3.5,
      3.5,
      environment === "countryside" ? "#7a7b72" : "#626160",
      0.05,
    );
    const roadUvs: number[] = [];
    const roadVertices = road.geometry.attributes.position;
    for (let i = 0; i < roadVertices.count; i++)
      roadUvs.push(roadVertices.getX(i) / 8, roadVertices.getZ(i) / 8);
    road.geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(roadUvs, 2),
    );
    road.material.map = roadTexture;
    road.material.normalMap = roadNormal;
    road.material.normalScale.set(0.25, 0.25);
    road.receiveShadow = true;
    group.add(road);
    group.add(ribbon(start, 160, -3.25, -3.14, "#e2e3cf", 0.065));
    group.add(ribbon(start, 160, 3.14, 3.25, "#e2e3cf", 0.065));
    for (let t = start; t < start + 160; t += 16)
      group.add(ribbon(t, 7, -0.08, 0.08, "#e7e3c8", 0.075));
    if (environment === "countryside") {
      const vertices: number[] = [],
        wallUvs: number[] = [];
      for (let t = start; t < start + 160; t += 4)
        for (const edge of [-4.5, -4.05]) {
          const a = [center(t) + edge, elevation(t) - 0.15, -t],
            b = [center(t + 4) + edge, elevation(t + 4) - 0.15, -t - 4];
          const c = [a[0], a[1] + 1.05, a[2]],
            d = [b[0], b[1] + 1.05, b[2]];
          vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
          wallUvs.push(
            t / 2.5,
            0,
            (t + 4) / 2.5,
            0,
            t / 2.5,
            1,
            (t + 4) / 2.5,
            0,
            (t + 4) / 2.5,
            1,
            t / 2.5,
            1,
          );
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(wallUvs, 2));
      geometry.computeVertexNormals();
      const wall = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          map: stoneTexture,
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      );
      wall.castShadow = wall.receiveShadow = true;
      group.add(wall);
      group.add(ribbon(start, 160, -4.5, -4.05, "#817f67", 0.9));
    } else {
      // Roadside markers and a continuous coastal guardrail.
      for (let t = start; t < start + 160; t += 16) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.9, 0.14),
          new THREE.MeshStandardMaterial({ color: "#d9dfd5" }),
        );
        post.position.set(center(t) - 4.3, elevation(t) + 0.45, -t);
        group.add(post);
      }
      group.add(ribbon(start, 160, -4.4, -4.15, "#b6c0ba", 0.82));
    }
    const trees =
      environment === "desert" ? 18 : environment === "countryside" ? 75 : 95;
    const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.24, 2.7, 9);
    const treeGeometry =
      environment === "desert"
        ? new THREE.CylinderGeometry(0.45, 0.6, 5, 7)
        : environment === "countryside"
          ? makeBroadleafGeometry()
          : makePineGeometry();
    const trunks = new THREE.InstancedMesh(
      trunkGeometry,
      new THREE.MeshStandardMaterial({ color: "#786f5c" }),
      trees,
    );
    const crowns = new THREE.InstancedMesh(
      treeGeometry,
      new THREE.MeshStandardMaterial({
        color:
          environment === "desert"
            ? "#727b57"
            : environment === "countryside"
              ? "#f1f1d9"
              : "#b8c7a4",
        map:
          environment === "desert"
            ? null
            : environment === "countryside"
              ? broadleafTexture
              : foliageTexture,
        alphaTest: 0.35,
        alphaToCoverage: true,
        vertexColors: environment === "countryside",
        side: THREE.DoubleSide,
        roughness: 0.95,
      }),
      trees,
    );
    const branches =
      environment === "countryside"
        ? new THREE.InstancedMesh(
            makeBranchGeometry(),
            new THREE.MeshStandardMaterial({
              color: "#706e5a",
              roughness: 0.95,
            }),
            trees,
          )
        : null;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < trees; i++) {
      const seed = index * 111 + i * 7,
        t = start + random(seed) * 160;
      let offset = 16 + random(seed + 1) * 200;
      if (environment !== "coast" && i % 3 === 0) offset *= -1;
      if (environment === "countryside")
        offset =
          i < 12
            ? -(15 + random(seed + 1) * 13)
            : (85 + random(seed + 1) * 300) * (i % 3 === 0 ? 1 : -1);
      const scale = 0.55 + random(seed + 2) * 1.2;
      dummy.position.set(
        center(t) + offset,
        drivingSurface(t, center(t) + offset, environment) + 1.2 * scale,
        -t,
      );
      dummy.scale.set(
        scale * (0.8 + random(seed + 8) * 0.4),
        scale * (0.8 + random(seed + 9) * 0.45),
        scale * (0.8 + random(seed + 10) * 0.4),
      );
      dummy.rotation.y = random(seed + 3) * 6;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 3.2 * scale;
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      branches?.setMatrixAt(i, dummy.matrix);
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    group.add(trunks, crowns);
    if (branches) {
      branches.castShadow = true;
      branches.receiveShadow = true;
      group.add(branches);
    }
    if (environment !== "desert") {
      const grass = new THREE.InstancedMesh(
        makeGrassGeometry(),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          color: "#6d873d",
          side: THREE.DoubleSide,
          roughness: 1,
        }),
        6000,
      );
      const transform = new THREE.Object3D();
      for (let i = 0; i < 6000; i++) {
        const seed = index * 7301 + i * 19,
          t = start + random(seed) * 160;
        const offset = (4.3 + random(seed + 3) * 50) * (i % 3 === 0 ? -1 : 1);
        transform.position.set(
          center(t) + offset,
          ground(t, offset, environment),
          -t,
        );
        transform.scale.setScalar(0.45 + random(seed + 5) * 0.8);
        transform.rotation.y = random(seed + 7) * 6.28;
        transform.updateMatrix();
        grass.setMatrixAt(i, transform.matrix);
      }
      grass.receiveShadow = true;
      grass.name = "Near grass";
      group.add(grass);
    }
    for (let i = 0; i < (environment === "countryside" ? 0 : 9); i++) {
      const t = start + random(index * 39 + i * 8) * 160,
        offset = 12 + random(index * 71 + i * 4) * 75;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          color: environment === "desert" ? "#b5967c" : "#7c8174",
          flatShading: true,
        }),
      );
      rock.position.set(center(t) + offset, ground(t, offset, environment), -t);
      rock.scale.set(1 + random(i * 3) * 3, 1 + random(i * 9) * 3, 2);
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
    }
    scene.add(group);
    chunks.set(index, group);
  }
  let distance = 80,
    speed = 0,
    lane = 1.8,
    carX = center(80) + 1.8,
    heading = Math.atan2(center(82) - center(78), 4),
    airYawRate = 0,
    yawThrust = 0,
    wheelSteering = 0,
    traveled = 0,
    surfaceY = elevation(80),
    groundLift = 0,
    flipRequest = controls.flip,
    flipPending = false,
    flipTime = -1,
    flipRoll = 0,
    altitude = 0,
    verticalSpeed = 0,
    flightTarget = 7,
    wasFlying = false,
    previousVerticalInput = 0,
    charge = 100,
    thrust = 0,
    last = performance.now(),
    lastReport = 0,
    reset = controls.reset,
    recover = controls.recover,
    frame = 0,
    stopped = false;
  const resize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  function animate(now: number) {
    if (stopped) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (controls.reset !== reset) {
      exhaust.clear();
      hasCarPosition = false;
      distance = 80;
      speed = 0;
      lane = 1.8;
      carX = center(80) + 1.8;
      heading = Math.atan2(center(82) - center(78), 4);
      traveled = 0;
      surfaceY = elevation(80);
      groundLift = 0;
      airYawRate = yawThrust = 0;
      wheelSteering = 0;
      steerFrontWheels(frontWheels, 0);
      flipTime = -1;
      flipRoll = 0;
      flipPending = false;
      flipRequest = controls.flip;
      altitude = 0;
      verticalSpeed = 0;
      flightTarget = 7;
      wasFlying = false;
      previousVerticalInput = 0;
      charge = 100;
      reset = controls.reset;
    }
    if (controls.recover !== recover) {
      recover = controls.recover;
      lane = 1.8;
      carX = center(distance) + lane;
      heading = Math.atan2(center(distance + 2) - center(distance - 2), 4);
      surfaceY = elevation(distance);
      groundLift = 0;
      airYawRate = yawThrust = 0;
      wheelSteering = 0;
      steerFrontWheels(frontWheels, 0);
      speed = Math.min(speed, 40);
      altitude = verticalSpeed = flipRoll = 0;
      flipTime = -1;
      flipPending = false;
      flipRequest = controls.flip;
      flightTarget = 7;
      wasFlying = false;
      previousVerticalInput = 0;
      controls.flying = controls.boost = boosting = false;
      controls.keys.clear();
      thrust = 0;
      car.rotation.set(0, -heading, 0);
      exhaust.clear();
      hasCarPosition = false;
    }
    if (environment !== controls.environment) {
      environment = controls.environment;
      chunks.forEach(disposeGroup);
      chunks = new Map();
    }
    const weatherChanged = daytime !== controls.daytime;
    if (weatherChanged) {
      daytime = controls.daytime;
    }
    const night = daytime === "night",
      sunset = daytime === "sunset";
    const skyMat = sky.material;
    const waterMat = water.material;
    skyMat.uniforms.top.value.set(
      night ? "#18263e" : sunset ? "#647b9b" : "#3782d7",
    );
    skyMat.uniforms.horizon.value.set(
      night ? "#4c5367" : sunset ? "#f1b583" : "#b1d0ee",
    );
    skyMat.uniforms.glow.value.set(sunset ? "#ffb86f" : "#f9e6c8");
    skyMat.uniforms.cloud.value.set(
      night ? "#37445a" : sunset ? "#a7959c" : "#e0e5e8",
    );
    skyMat.uniforms.strength.value = night ? 0 : 1;
    skyMat.uniforms.time.value = now / 1000;
    const sunDirection = new THREE.Vector3(
      -0.48,
      sunset ? 0.065 : night ? 0.2 : 0.5,
      -1,
    ).normalize();
    skyMat.uniforms.sunDirection.value.copy(sunDirection);
    waterMat.uniforms.sunDirection.value.copy(sunDirection);
    waterMat.uniforms.time.value = now / 1000;
    waterMat.uniforms.strength.value = night ? 0.05 : 1;
    waterMat.uniforms.color.value.set(
      night ? "#172a3c" : sunset ? "#405563" : "#427b94",
    );
    waterMat.uniforms.fogColor.value.set(
      night ? "#3a4558" : sunset ? "#b5a2a0" : "#a6c0ce",
    );
    if (weatherChanged)
      scene.fog = new THREE.FogExp2(
        night ? "#354154" : sunset ? "#b5a2a0" : "#b0c4cb",
        0.0015,
      );
    ambient.intensity = night ? 0.55 : sunset ? 1.1 : 0.95;
    ambient.color.set(sunset ? "#a1b5db" : "#d8e7f3");
    ambient.groundColor.set(sunset ? "#66594a" : "#6a755a");
    sun.intensity = night ? 0.2 : sunset ? 3 : 2.5;
    sun.color.set(sunset ? "#ffc18a" : "#fff1dc");
    if (!controls.paused) {
      let previousX = carX;
      let previousDistance = distance;
      const k = controls.keys;
      boosting = (k.has("shift") || controls.boost) && charge > 1;
      const accelerating = k.has("w") || k.has("arrowup");
      const braking = k.has("s") || k.has("arrowdown");
      if (braking) speed = Math.max(0, speed - dt * 65);
      else if (boosting) speed = Math.min(265, speed + dt * 70);
      else if (accelerating) speed = Math.min(180, speed + dt * 32);
      else if (controls.cruise)
        speed +=
          Math.sign(72 - speed) * Math.min(Math.abs(72 - speed), dt * 18);
      else speed = Math.max(0, speed - dt * 5);
      // Free-flight lift is unlimited by design; boost and rolls share a rechargeable reserve.
      // Gravity and bounded acceleration remain active. These are gameplay values.
      controls.chargeLocked = charge < 35;
      if (!boosting) charge = Math.min(100, charge + dt * 7);
      if (boosting) charge = Math.max(0, charge - dt * 16);
      const steering =
        (k.has("a") || k.has("arrowleft") ? 1 : 0) -
        (k.has("d") || k.has("arrowright") ? 1 : 0);
      const roadHeading = Math.atan2(
        center(distance + 2) - center(distance - 2),
        4,
      );
      const previousSteeringHeading = heading;
      if (controls.cruise && !steering) {
        const previousHeading = heading;
        const previousRate = airYawRate;
        heading = THREE.MathUtils.damp(heading, roadHeading, 2.5, dt);
        carX = THREE.MathUtils.damp(carX, center(distance) + 1.8, 1.7, dt);
        airYawRate = dt > 0 ? (heading - previousHeading) / dt : 0;
        yawThrust = controls.flying
          ? yawJetDemand(airYawRate, previousRate, dt)
          : 0;
      } else {
        if (steering) controls.cruise = false;
        if (controls.flying || altitude > 0.3) {
          const previousRate = airYawRate;
          const targetRate = (-steering * 0.8) / (1 + speed / 180);
          airYawRate = THREE.MathUtils.damp(
            airYawRate,
            targetRate,
            steering ? 3 : 6,
            dt,
          );
          if (!steering && Math.abs(airYawRate) < 0.02) airYawRate = 0;
          heading += airYawRate * dt;
          // Command torque from angular acceleration plus yaw damping. The
          // opposite pair naturally fires when the steering key is released.
          yawThrust = yawJetDemand(airYawRate, previousRate, dt);
        } else {
          airYawRate = yawThrust = 0;
          heading -=
            (steering * dt * 1.2 * Math.min(1, speed / 15)) / (1 + speed / 100);
        }
      }
      const steeringTarget =
        controls.flying || altitude > 0.3
          ? 0
          : steering
            ? (steering * 0.5) / (1 + speed / 100)
            : controls.cruise && dt > 0
              ? THREE.MathUtils.clamp(
                  Math.atan(
                    (-2.77 * (heading - previousSteeringHeading)) /
                      (dt * Math.max(speed / 3.6, 1)),
                  ),
                  -0.5,
                  0.5,
                )
              : 0;
      wheelSteering = THREE.MathUtils.damp(
        wheelSteering,
        steeringTarget,
        9,
        dt,
      );
      steerFrontWheels(frontWheels, wheelSteering);
      const offroad = Math.abs(lane) > 3.5;
      if (offroad && altitude < 0.3)
        speed = Math.max(0, speed - dt * (3 + speed * 0.09));
      const advance = (speed / 3.6) * dt;
      distance += Math.cos(heading) * advance;
      carX += Math.sin(heading) * advance;
      traveled += advance;
      lane = carX - center(distance);
      const previousGround = surfaceY;
      surfaceY = drivingSurface(distance, carX, environment);
      if (altitude > 0.01) {
        const change = previousGround - surfaceY;
        altitude += change;
        flightTarget = Math.max(0, flightTarget + change);
      }
      // The ocean and the outer generated boundary return the car to solid ground.
      if (
        (environment === "coast" && surfaceY < -4 && altitude < 0.2) ||
        Math.abs(lane) > 1200
      ) {
        lane = 1.8;
        carX = center(distance) + lane;
        surfaceY = elevation(distance);
        heading = roadHeading;
        speed = 0;
        previousX = carX;
        previousDistance = distance;
        exhaust.clear();
        hasCarPosition = false;
      }
      if (controls.flip !== flipRequest) {
        flipRequest = controls.flip;
        if (charge >= 35 && flipTime < 0) {
          controls.flying = true;
          flipPending = true;
        }
      }
      if (flipPending && altitude > 2.8) {
        flipPending = false;
        flipTime = 0;
        charge = Math.max(0, charge - 14);
      }
      if (flipTime >= 0) {
        flipTime += dt;
        const progress = Math.min(1, flipTime / 1.25);
        flipRoll = progress * progress * (3 - 2 * progress) * Math.PI * 2;
        if (progress === 1) {
          flipTime = -1;
          flipRoll = 0;
        }
      }
      if (controls.flying && !wasFlying) flightTarget = Math.max(7, altitude);
      if (controls.flying) {
        const verticalInput = (k.has("e") ? 1 : 0) - (k.has("q") ? 1 : 0);
        if (verticalInput !== previousVerticalInput)
          flightTarget = Math.max(0, altitude + verticalSpeed * 0.4);
        if (verticalInput)
          flightTarget = Math.max(0, altitude + verticalInput * 22);
        previousVerticalInput = verticalInput;
      }
      wasFlying = controls.flying;
      const targetAltitude = controls.flying ? flightTarget : 0;
      if (altitude < 0) {
        altitude = 0;
        verticalSpeed = 0;
      }
      const airborne = altitude > 0.01 || controls.flying;
      thrust = airborne
        ? THREE.MathUtils.clamp(
            9.81 + (targetAltitude - altitude) * 3.2 - verticalSpeed * 3.1,
            0,
            18,
          )
        : 0;
      if (airborne) {
        verticalSpeed += (thrust - 9.81) * dt;
        altitude += verticalSpeed * dt;

        if (altitude < 0.025 && verticalSpeed < 0) {
          altitude = 0;
          verticalSpeed = 0;
          thrust = 0;
        }
      }
      const contact = resolveGuardrail(
        {
          previousX,
          previousDistance,
          x: carX,
          distance,
          heading,
          baseY: surfaceY + altitude + groundLift + 0.07,
          pitch: car.rotation.x,
          roll: altitude > 0.3 ? flipRoll + steering * 0.14 : car.rotation.z,
          speed,
        },
        center,
        elevation,
      );
      if (contact.hit) {
        carX = contact.x;
        heading = contact.heading;
        speed = contact.speed;
        lane = carX - center(distance);
        const correctedGround = drivingSurface(distance, carX, environment);
        if (altitude > 0.01) {
          const change = surfaceY - correctedGround;
          altitude = Math.max(0, altitude + change);
          flightTarget = Math.max(0, flightTarget + change);
        }
        surfaceY = correctedGround;
      }
      const sampleGround = (t: number, x: number) =>
        drivingSurface(t, x, environment);
      const forwardGround = sampleGround(
        distance + Math.cos(heading) * 2,
        carX + Math.sin(heading) * 2,
      );
      const backwardGround = sampleGround(
        distance - Math.cos(heading) * 2,
        carX - Math.sin(heading) * 2,
      );
      car.rotation.x = THREE.MathUtils.damp(
        car.rotation.x,
        altitude > 0.3 ? -0.06 : Math.atan2(forwardGround - backwardGround, 4),
        5,
        dt,
      );
      const rightGround = sampleGround(
        distance - Math.sin(heading),
        carX + Math.cos(heading),
      );
      const leftGround = sampleGround(
        distance + Math.sin(heading),
        carX - Math.cos(heading),
      );
      const slopeRoll = Math.atan2(
        (rightGround - leftGround) * Math.cos(car.rotation.x),
        2,
      );
      car.rotation.z =
        altitude > 0.3
          ? steering * 0.14 + flipRoll
          : THREE.MathUtils.damp(car.rotation.z, slopeRoll, 10, dt);
      car.rotation.y = -heading;
      if (altitude <= 0.3) {
        let neededLift = 0;
        for (const contact of groundContacts) {
          contactPoint.copy(contact);
          // Tire contact follows the steered front axle, independently of spin.
          if (contact.z < -1 && contact.y !== 0.27) {
            const axle = frontWheels[contact.x < 0 ? 0 : 1];
            contactPoint
              .sub(axle.position)
              .applyQuaternion(axle.quaternion)
              .add(axle.position);
          }
          contactPoint.applyQuaternion(car.quaternion);
          const groundY = sampleGround(
            distance - contactPoint.z,
            carX + contactPoint.x,
          );
          neededLift = Math.max(
            neededLift,
            groundY - contactPoint.y - surfaceY,
          );
        }
        // Raise immediately to prevent penetration while pitch catches up;
        // settle more gently when leaving a crest or crossing uneven ground.
        groundLift = Math.max(
          neededLift,
          THREE.MathUtils.damp(groundLift, neededLift, 10, dt),
        );
      } else groundLift = THREE.MathUtils.damp(groundLift, 0, 8, dt);
    }
    const chunk = Math.floor(distance / 160);
    for (let i = chunk - 1; i <= chunk + 7; i++)
      if (!chunks.has(i)) buildChunk(i);
    chunks.forEach((g, i) => {
      const grass = g.getObjectByName("Near grass");
      if (grass) grass.visible = i <= chunk + 2;
      if (i < chunk - 1 || i > chunk + 7) {
        disposeGroup(g);
        chunks.delete(i);
      }
    });
    car.position.set(
      carX,
      surfaceY + Math.max(0, altitude) + groundLift + 0.015,
      -distance,
    );
    car.rotation.y = -heading;
    wing.position.y = THREE.MathUtils.damp(
      wing.position.y,
      speed > 95 || altitude > 0.3 ? 1.06 : 0.98,
      3,
      dt,
    );
    if (!controls.paused)
      for (const wheel of wheels) wheel.rotation.x += (speed / 3.6 / 0.39) * dt;
    shadow.position.set(car.position.x, surfaceY + 0.09, -distance);
    (shadow.material as THREE.MeshBasicMaterial).opacity =
      0.25 / (1 + altitude * 0.15);
    const side = controls.camera === 1 ? 8 : 0;
    const portrait = camera.aspect < 0.8;
    const behind =
      controls.camera === 1
        ? 7
        : controls.camera === 2
          ? -0.8
          : portrait
            ? flipTime >= 0
              ? 14
              : 12
            : flipTime >= 0
              ? 12
              : 10.5;
    const height = controls.camera === 2 ? 1.4 : 3.8;
    const target = new THREE.Vector3(
      car.position.x + Math.cos(heading) * side - Math.sin(heading) * behind,
      car.position.y + height,
      -distance + Math.sin(heading) * side + Math.cos(heading) * behind,
    );
    const cameraGround = drivingSurface(-target.z, target.x, environment);
    target.y = Math.max(target.y, cameraGround + 1.5);
    // Keep vertical camera lag short so climbing/descending cannot crop the car.
    const followY = THREE.MathUtils.damp(camera.position.y, target.y, 16, dt);
    camera.position.lerp(target, 1 - Math.exp(-dt * 5));
    camera.position.y = followY;
    chaseLookAhead = THREE.MathUtils.damp(
      chaseLookAhead,
      controls.camera === 1 ? 0 : flipTime >= 0 ? 2 : 4,
      8,
      dt,
    );
    chaseLookHeight = THREE.MathUtils.damp(
      chaseLookHeight,
      flipTime >= 0 ? 0 : 0.7,
      8,
      dt,
    );
    const lookAhead = controls.camera === 2 ? 28 : chaseLookAhead;
    camera.lookAt(
      car.position.x + Math.sin(heading) * lookAhead,
      Math.max(
        car.position.y + (controls.camera === 2 ? 1.2 : chaseLookHeight),
        altitude < 0.3
          ? drivingSurface(
              distance + Math.cos(heading) * lookAhead,
              car.position.x + Math.sin(heading) * lookAhead,
              environment,
            ) + 0.7
          : -Infinity,
      ),
      -distance - Math.cos(heading) * lookAhead,
    );
    car.visible = controls.camera !== 2;
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      portrait ? 57 : speed > 150 || flipTime >= 0 ? 50 : 44,
      2,
      dt,
    );
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    sun.position
      .copy(car.position)
      .add(new THREE.Vector3(-95, sunset ? 38 : 140, -180));
    sun.target.position.copy(car.position);
    water.position.z = -distance;
    water.visible = environment === "coast";
    if (hasCarPosition && dt > 0 && !controls.paused)
      exhaustVelocity
        .copy(car.position)
        .sub(previousCarPosition)
        .divideScalar(dt);
    else exhaustVelocity.set(0, 0, 0);
    previousCarPosition.copy(car.position);
    hasCarPosition = true;
    exhaust.update(
      controls.paused ? 0 : dt,
      car,
      camera,
      outlets,
      exhaustVelocity,
      thrust / 18,
      boosting,
      rollJetDemand(flipTime < 0 ? -1 : flipTime / 1.25),
      yawThrust,
      night,
      exhaustSurfaceHeight,
    );
    renderer.render(scene, camera);
    if (now - lastReport > 100) {
      report({
        speed: Math.round(speed),
        distance: traveled / 1000,
        altitude: Math.round(altitude),
        charge: Math.round(charge),
        flying: controls.flying,
        thrust: controls.paused
          ? 0
          : Math.max(
              thrust / 18,
              flipTime >= 0 ? 0.8 : 0,
              Math.abs(yawThrust) * 0.7,
            ),
        boosting: !controls.paused && boosting,
        flipping: flipTime >= 0,
        surface: Math.abs(lane) > 3.5 ? "offroad" : "road",
      });
      lastReport = now;
    }
  }
  camera.position.set(
    center(distance) + 4,
    elevation(distance) + 7,
    -distance + 14,
  );
  frame = requestAnimationFrame(animate);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.userData.ownedTexture instanceof THREE.Texture)
          o.userData.ownedTexture.dispose();
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    foliageTexture.dispose();
    broadleafTexture.dispose();
    meadowTexture.dispose();
    stoneTexture.dispose();
    grassNormal.dispose();
    roadNormal.dispose();
    grassTexture.dispose();
    roadTexture.dispose();
    reflections.dispose();
    sun.shadow.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
