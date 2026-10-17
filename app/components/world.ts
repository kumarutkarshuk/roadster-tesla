import * as THREE from "three";
import { makeCar, steerFrontWheels } from "./car";
import { pedalSpeed, slowDown, steeringRate, chaseDistance } from "./driving";
import { airTurn, verticalFlight } from "./flight";
import {
  center,
  elevation,
  ground,
  terrainOffsets,
  drivingSurface,
  ROAD_HALF_WIDTH,
  SHOULDER_HALF_WIDTH,
  CRUISE_LANE,
} from "./terrain";
import { buildCity, buildCityHorizon, makeCityWindows } from "./city";
import { makeCoastalForest, naturalGround } from "./coast";
import { cityDistricts, sweepScenery, type CityBox } from "./city-layout";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { resolveGuardrail } from "./guardrail";
import { createExhaust, rollJetDemand } from "./exhaust";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  makeSky,
  makeOcean,
  makeSurfaceTexture,
  makeBroadleafGeometry,
  makeGrassGeometry,
  makeNormalMap,
  makeBranchGeometry,
} from "./scenery";

export type Environment = "coast" | "cyber";
export type Daytime = "day" | "sunset" | "night";
export type Telemetry = {
  speed: number;
  distance: number;
  altitude: number;
  charge: number;
  // Show reverse separately so speed and motor sound stay positive.
  reversing?: boolean;
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
  environment: Environment;
  daytime: Daytime;
  keys: Set<string>;
  reset: number;
  recover: number;
  chargeLocked?: boolean;
  flip: number;
};
// Ground colours support lush coastal foliage and a darker urban boulevard.
const palettes = {
  coast: { ground: "#c0c4a4", dark: "#849773" },
  cyber: { ground: "#35414b", dark: "#29343c" },
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
  const mesh = strip(points, color);
  // Painted lines stay above asphalt in the depth buffer, even from high flight.
  if (raise >= 0.06 && raise <= 0.075) {
    mesh.material.polygonOffset = true;
    mesh.material.polygonOffsetFactor = -2;
    mesh.material.polygonOffsetUnits = -2;
  }
  return mesh;
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
  const cityWindows = makeCityWindows();
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
    0.5,
    2400,
  );
  // A restrained glow softens lamps and bright reflections in the night drive.
  const composer = new EffectComposer(renderer);
  // Multisampling keeps leaf edges and lane markings clean after post-processing.
  composer.renderTarget1.samples = Math.min(4, renderer.capabilities.maxSamples);
  composer.renderTarget2.samples = Math.min(4, renderer.capabilities.maxSamples);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.24, 0.45, 1.2);
  composer.addPass(bloom);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
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
  // Six nearby street lamps light the road without adding lights to every distant block.
  const streetLights = Array.from({ length: 6 }, () => {
    const light = new THREE.PointLight("#b5dcff", 110, 30, 2);
    scene.add(light);
    return light;
  });
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
  // Smooth turns without letting forward movement stretch the camera gap.
  let chaseHeading = 0, chaseBehind = 8;
  scene.add(car);
  // A feathered black contact shadow blends into asphalt without a visible coloured disc.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { opacity: { value: 0.24 } },
      vertexShader: `
        varying vec2 shadowUv;
        void main() {
          shadowUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float opacity;
        varying vec2 shadowUv;
        void main() {
          float radius = length(shadowUv * 2.0 - 1.0);
          float fade = 1.0 - smoothstep(0.1, 1.0, radius);
          gl_FragColor = vec4(0.0, 0.0, 0.0, opacity * fade * fade);
        }
      `,
    }),
  );
  const shadowNormal = new THREE.Vector3();
  const shadowAxis = new THREE.Vector3(0, 0, 1);
  shadow.scale.set(1.35, 2.8, 1);
  scene.add(shadow);
  let environment = controls.environment,
    daytime: Daytime | undefined;
  let chunks = new Map<number, THREE.Group>();
  const districts = new Map<string, THREE.Group>();
  let districtAddress = "";
  let cityHorizon: THREE.Group | null = null;
  // Reuse nearby solid objects for car, roof, and camera contact checks.
  const nearbySolids = (x: number, t: number, reach = 15): CityBox[] => {
    const boxes: CityBox[] = [];
    if (environment === "cyber") {
      const row = Math.floor(t / 160), column = Math.floor((x - center(t)) / 208);
      for (let z = row - 1; z <= row + 1; z++)
        for (let c = column - 1; c <= column + 1; c++)
          boxes.push(...(districts.get(`${z}:${c}`)?.userData.solids ?? []));
    } else {
      const row = Math.floor(t / 160);
      for (let z = row - 1; z <= row + 1; z++)
        boxes.push(...(chunks.get(z)?.userData.solids ?? []));
    }
    return boxes.filter(b => Math.abs(b.x - x) < b.w / 2 + reach && Math.abs(b.z + t) < b.d / 2 + reach);
  };
  const exhaustSurfaceHeight = (x: number, z: number) => {
    const height = drivingSurface(-z, x, environment);
    return environment === "coast" ? Math.max(-5, height) : height;
  };
  const disposeGroup = (g: THREE.Object3D) => {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // Release per-instance buffers when scenery leaves the streamed world.
        if (o instanceof THREE.InstancedMesh) o.dispose();
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
    const solids: CityBox[] = [];
    group.userData.solids = solids;
    const start = index * 160;
    const p = palettes[environment];
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const offsets = terrainOffsets;
    const base = new THREE.Color(p.ground), dark = new THREE.Color(p.dark);
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
        map: environment === "coast" ? meadowTexture : roadTexture,
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 1,
      }),
    );
    if (environment === "coast") naturalGround(terrain.material);
    terrain.receiveShadow = true;
    group.add(terrain);
    // Six full lanes, broad shoulders and matching markings make both roads feel open.
    // Shoulder strips stop at the asphalt edge, avoiding overlapping road layers from above.
    for (const side of [-1, 1])
      group.add(ribbon(start, 160, side < 0 ? -SHOULDER_HALF_WIDTH : ROAD_HALF_WIDTH,
        side < 0 ? -ROAD_HALF_WIDTH : SHOULDER_HALF_WIDTH, "#7f8786", 0.02));
    const road = ribbon(start, 160, -ROAD_HALF_WIDTH, ROAD_HALF_WIDTH,
      environment === "cyber" ? "#283542" : "#65696a", 0.05);
    const roadUvs: number[] = [];
    const roadVertices = road.geometry.attributes.position;
    for (let i = 0; i < roadVertices.count; i++)
      roadUvs.push(roadVertices.getX(i) / 8, roadVertices.getZ(i) / 8);
    road.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(roadUvs, 2));
    road.material.map = roadTexture;
    road.material.normalMap = roadNormal;
    road.material.normalScale.set(0.18, 0.18);
    // Matte asphalt keeps the road readable when driving towards reflected light.
    road.material.roughness = environment === "cyber" ? 0.92 : 0.86;
    road.material.metalness = 0;
    road.receiveShadow = true;
    group.add(road);
    for (const edge of [-11.1, 11.1])
      group.add(ribbon(start, 160, edge - 0.08, edge + 0.08, "#eeeee0", 0.065));
    for (const edge of [-0.18, 0.18])
      group.add(ribbon(start, 160, edge - 0.055, edge + 0.055, "#dfc78b", 0.07));
    for (let t = start; t < start + 160; t += 16)
      for (const lane of [-7.6, -3.8, 3.8, 7.6])
        group.add(ribbon(t, 6, lane - 0.065, lane + 0.065, "#e5e7e2", 0.075));
    // Keep the visible safety rail aligned with the driving collision boundary.
    for (let t = start; t < start + 160; t += 8) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14),
        new THREE.MeshStandardMaterial({ color: "#a8b5b8", metalness: 0.7, roughness: 0.35 }));
      post.position.set(center(t) - 14.4, elevation(t) + 0.45, -t);
      group.add(post);
    }
    group.add(ribbon(start, 160, -14.625, -14.175, "#b6c0ba", 0.82));
    if (environment === "cyber") {

      // Raised pavements and thin luminous edges frame the city highway.
      for (const side of [-1, 1]) {
        group.add(ribbon(start, 160, side < 0 ? -23 : 14.8, side < 0 ? -14.8 : 23, "#49545d", 0.18));
        const light = ribbon(start, 160, side * 14.8 - 0.045, side * 14.8 + 0.045, "#66d6eb", 0.2);
        light.material.emissive.set("#38b9d5");
        light.material.emissiveIntensity = 2;
        group.add(light);
      }
      scene.add(group);
      chunks.set(index, group);
      return;
    }
    // Layered leaf clusters, visible branches and dense verge grass soften the coast.
    group.add(makeCoastalForest(index, solids));
    const trees = 165;
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.24, 2.7, 9),
      new THREE.MeshStandardMaterial({ color: "#786f5c" }), trees);
    const crowns = new THREE.InstancedMesh(makeBroadleafGeometry(),
      new THREE.MeshStandardMaterial({ color: "#b0bd91", map: broadleafTexture,
        alphaTest: 0.5, vertexColors: true,
        side: THREE.DoubleSide, roughness: 0.95 }), trees);
    const branches = new THREE.InstancedMesh(makeBranchGeometry(),
      new THREE.MeshStandardMaterial({ color: "#706e5a", roughness: 0.95 }), trees);
    trunks.geometry.computeBoundingBox();
    const treeBounds = new THREE.Box3(), treeSize = new THREE.Vector3(), treeCenter = new THREE.Vector3();
    // Only solid trunks block driving; leaf clusters must not seal off clear ground.
    const addTreeSolid = (geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) => {
      treeBounds.copy(geometry.boundingBox!).applyMatrix4(matrix);
      treeBounds.getSize(treeSize);
      treeBounds.getCenter(treeCenter);
      solids.push({ x: treeCenter.x, y: treeCenter.y, z: treeCenter.z, w: treeSize.x, h: treeSize.y, d: treeSize.z });
    };
    const dummy = new THREE.Object3D();
    for (let i = 0; i < trees; i++) {
      const seed = index * 111 + i * 7,
        t = start + random(seed) * 160;
      const offset = i < 55 ? 23 + random(seed + 1) * 45 : 60 + random(seed + 1) * 125;
      const scale = 0.65 + random(seed + 2) * 1.35;
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
      addTreeSolid(trunks.geometry, dummy.matrix);
      dummy.position.y += 3.2 * scale;
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, new THREE.Color().setHSL(0.23 + random(seed + 12) * 0.06, 0.18 + random(seed + 13) * 0.16, 0.65 + random(seed + 14) * 0.2));
      branches.setMatrixAt(i, dummy.matrix);
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    group.add(trunks, crowns);
    branches.castShadow = true;
    branches.receiveShadow = true;
    group.add(branches);
    {
      const grass = new THREE.InstancedMesh(
        makeGrassGeometry(),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          color: "#b6bd91",
          side: THREE.DoubleSide,
          roughness: 1,
        }),
        9000,
      );
      const transform = new THREE.Object3D();
      for (let i = 0; i < 9000; i++) {
        const seed = index * 7301 + i * 19,
          t = start + random(seed) * 160;
        const offset = i % 4 === 0 ? -(14.9 + random(seed + 3) * 3) : 14.9 + random(seed + 3) ** 1.8 * 48;
        transform.position.set(
          center(t) + offset,
          ground(t, offset, environment),
          -t,
        );
        transform.scale.setScalar(0.8 + random(seed + 5) * 1.1);
        transform.rotation.y = random(seed + 7) * 6.28;
        transform.updateMatrix();
        grass.setMatrixAt(i, transform.matrix);
      }
      grass.receiveShadow = true;
      grass.name = "Near grass";
      group.add(grass);
    }
    for (let i = 0; i < 14; i++) {
      const t = start + random(index * 39 + i * 8) * 160,
        offset = 20 + random(index * 71 + i * 4) * 75;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          color: "#aaa99a",
          // Fine mineral grain keeps boulders natural instead of looking like masonry.
          map: grassTexture,
          bumpMap: grassTexture,
          bumpScale: 0.18,
          roughness: 0.95,
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
    lane = CRUISE_LANE,
    carX = center(80) + CRUISE_LANE,
    heading = Math.atan2(center(82) - center(78), 4),
    airYawRate = 0,
    airBank = 0,
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
    composer.setSize(container.clientWidth, container.clientHeight);
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
      lane = CRUISE_LANE;
      carX = center(80) + CRUISE_LANE;
      heading = Math.atan2(center(82) - center(78), 4);
      traveled = 0;
      surfaceY = elevation(80);
      groundLift = 0;
      airYawRate = yawThrust = airBank = 0;
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
      lane = CRUISE_LANE;
      carX = center(distance) + lane;
      heading = Math.atan2(center(distance + 2) - center(distance - 2), 4);
      surfaceY = elevation(distance);
      groundLift = 0;
      airYawRate = yawThrust = airBank = 0;
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
      districts.forEach(disposeGroup);
      districts.clear();
      if (cityHorizon) disposeGroup(cityHorizon);
      cityHorizon = null;
      districtAddress = "";
      daytime = undefined;
    }
    // Enforce night in the renderer as well as in the scenery menu.
    const sceneTime = environment === "cyber" ? "night" : controls.daytime;
    const weatherChanged = daytime !== sceneTime;
    if (weatherChanged) {
      daytime = sceneTime;
    }
    const night = daytime === "night",
      sunset = daytime === "sunset";
    const skyMat = sky.material;
    const waterMat = water.material;
    skyMat.uniforms.top.value.set(
      night ? (environment === "cyber" ? "#040a17" : "#18263e") : sunset ? "#647b9b" : "#3782d7",
    );
    skyMat.uniforms.horizon.value.set(
      night ? (environment === "cyber" ? "#243b51" : "#4c5367") : sunset ? "#f1b583" : "#b1d0ee",
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
        night ? (environment === "cyber" ? "#122534" : "#354154") : sunset ? "#b5a2a0" : "#b0c4cb",
        environment === "cyber" ? 0.0024 : 0.0012,
      );
    // Ease aerial haze so nearby rooftops remain visible from high flight.
    if (environment === "cyber" && scene.fog instanceof THREE.FogExp2)
      scene.fog.density = 0.0024 / Math.sqrt(1 + altitude / 220);
    // Night streets need faint reflections, without bright studio panels washing out the car.
    scene.environmentIntensity = environment === "cyber" ? 0.045 : 0.35;
    ambient.intensity = night ? 0.78 : sunset ? 1.1 : 0.95;
    ambient.color.set(sunset ? "#a1b5db" : "#d8e7f3");
    ambient.groundColor.set(sunset ? "#66594a" : "#6a755a");
    // At night, broad sky fill stays shadow-free; its small shadow map caused hard road patches.
    sun.castShadow = !night;
    sun.intensity = night ? 0.3 : sunset ? 3 : 2.5;
    sun.color.set(sunset ? "#ffc18a" : "#fff1dc");
    // Pools of light follow the actual boulevard lamp spacing in both driving directions.
    streetLights.forEach((light, i) => {
      const t = Math.floor((distance - 12) / 32) * 32 + 12 + (Math.floor(i / 2) - 1) * 32;
      light.position.set(center(t) + (i % 2 ? 13.3 : -13.3), elevation(t) + 10.7, -t);
      light.visible = night && environment === "cyber";
    });
    if (!controls.paused) {
      const previousBaseY = surfaceY + altitude + groundLift + 0.015;
      let previousX = carX;
      let previousDistance = distance;
      const k = controls.keys;
      const accelerating = k.has("w") || k.has("arrowup");
      const reversing = k.has("s") || k.has("arrowdown");
      // Reverse overrides boost and cruise; W first brakes any backward movement.
      boosting = !reversing && speed >= 0 && (k.has("shift") || controls.boost) && charge > 1;
      if (accelerating || reversing) controls.cruise = false;
      speed = pedalSpeed(speed, dt, accelerating, reversing, boosting, controls.cruise);
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
      const inAir = controls.flying || altitude > 0.3;
      if (steering) controls.cruise = false;
      if (inAir) {
        // Manual and cruise turns share the same nozzle torque and air resistance.
        const headingError = Math.atan2(Math.sin(roadHeading - heading), Math.cos(roadHeading - heading));
        const targetRate = controls.cruise && !steering
          ? THREE.MathUtils.clamp(headingError * 1.4, -0.5, 0.5)
          : (-steering * 0.7) / (1 + Math.abs(speed) / 220);
        const turn = airTurn(airYawRate, yawThrust, targetRate, dt);
        airYawRate = turn.rate;
        yawThrust = turn.jet;
        heading += airYawRate * dt;
      } else if (controls.cruise && !steering) {
        heading = THREE.MathUtils.damp(heading, roadHeading, 2.5, dt);
        carX = THREE.MathUtils.damp(carX, center(distance) + CRUISE_LANE, 1.7, dt);
        airYawRate = yawThrust = 0;
      } else {
        airYawRate = yawThrust = 0;
        heading += steeringRate(speed, steering) * dt;
      }
      const steeringTarget =
        controls.flying || altitude > 0.3
          ? 0
          : steering
            ? (steering * 0.5) / (1 + Math.abs(speed) / 100)
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
      const offroad = Math.abs(lane) > ROAD_HALF_WIDTH;
      // Rough ground slows both forward and reverse movement without changing gear.
      if (offroad && altitude < 0.3)
        speed = slowDown(speed, dt * (3 + Math.abs(speed) * 0.09));
      const advance = (speed / 3.6) * dt;
      distance += Math.cos(heading) * advance;
      carX += Math.sin(heading) * advance;
      // The trip counts distance covered even while backing up.
      traveled += Math.abs(advance);
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
        (environment === "coast" && Math.abs(lane) > 1200)
      ) {
        lane = CRUISE_LANE;
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
      // Landing assist measures clearance above roofs too, so supported cars stop their lift jets.
      let landingSurface = surfaceY;
      for (const box of nearbySolids(carX, distance)) {
        const top = box.y + box.h / 2;
        if (Math.abs(carX - box.x) < box.w / 2 + 1 && Math.abs(-distance - box.z) < box.d / 2 + 1.8
          && top <= surfaceY + altitude + 0.3)
          landingSurface = Math.max(landingSurface, top);
      }
      const supportHeight = landingSurface - surfaceY;
      const clearance = Math.max(0, altitude - supportHeight);
      if (controls.flying || clearance > 0.01) {
        const vertical = verticalFlight(clearance, verticalSpeed,
          Math.max(0, flightTarget - supportHeight), controls.flying, dt);
        altitude = supportHeight + vertical.height;
        verticalSpeed = vertical.velocity;
        thrust = vertical.thrust;
      } else {
        altitude = supportHeight;
        verticalSpeed = thrust = 0;
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
          roll: car.rotation.z,
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
      // Solid walls and trees stop the hull; descending onto roofs is a safe landing.
      const sceneryContact = sweepScenery(
        { x: previousX, y: previousBaseY, z: -previousDistance },
        { x: carX, y: surfaceY + altitude + groundLift + 0.015, z: -distance },
        nearbySolids(carX, distance),
        2.85,
        flipTime >= 0 ? 3 : 1.8,
        { heading, halfWidth: 1.3 + Math.abs(Math.sin(car.rotation.z)) * 0.85, halfLength: 2.5 },
      );
      if (sceneryContact.hit) {
        carX = sceneryContact.x;
        distance = -sceneryContact.z;
        lane = carX - center(distance);
        surfaceY = drivingSurface(distance, carX, environment);
        altitude = Math.max(0, sceneryContact.y - surfaceY - groundLift - 0.015);
        if (sceneryContact.axis === "y") {
          verticalSpeed = 0;
          if (sceneryContact.landed && !controls.flying) thrust = 0;
        } else {
          speed *= 0.25;
          controls.cruise = false;
        }
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
      // Bank follows the actual turn rate, so changing keys never snaps the body sideways.
      airBank = THREE.MathUtils.damp(airBank, -airYawRate * 0.2, 4, dt);
      car.rotation.z = altitude > 0.3
        ? airBank + flipRoll
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
    // Keep terrain behind the car too, so turning in flight never reveals an empty strip.
    const behindChunks = environment === "cyber" ? 7 : 3;
    const aheadChunks = environment === "cyber" ? 7 : 11;
    for (let i = chunk - behindChunks; i <= chunk + aheadChunks; i++)
      if (!chunks.has(i)) buildChunk(i);
    chunks.forEach((g, i) => {
      const grass = g.getObjectByName("Near grass");
      if (grass) grass.visible = Math.abs(i - chunk) <= 2;
      if (i < chunk - behindChunks || i > chunk + aheadChunks) {
        disposeGroup(g);
        chunks.delete(i);
      }
    });
    // An entire neighbourhood follows flight in both axes, beyond the old three rows.
    if (environment === "cyber") {
      const column = Math.floor(lane / 208);
      const address = `${chunk}:${column}`;
      if (districtAddress !== address) {
        const wanted = cityDistricts(distance, lane);
        const keys = new Set(wanted.map(d => d.key));
        districts.forEach((group, key) => {
          if (!keys.has(key)) { disposeGroup(group); districts.delete(key); }
        });
        for (const district of wanted) {
          if (districts.has(district.key)) continue;
          const group = buildCity(district.row, district.column, cityWindows);
          districts.set(district.key, group);
          scene.add(group);
        }
        if (cityHorizon) disposeGroup(cityHorizon);
        cityHorizon = buildCityHorizon(chunk, column, cityWindows);
        scene.add(cityHorizon);
        districtAddress = address;
      }
    }
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
    // Follow the road slope and car direction so the soft shadow does not cut into the surface.
    shadow.position.set(car.position.x, surfaceY + 0.06, -distance);
    shadowNormal.set(
      drivingSurface(distance, carX - 0.5, environment) - drivingSurface(distance, carX + 0.5, environment),
      1,
      drivingSurface(distance + 0.5, carX, environment) - drivingSurface(distance - 0.5, carX, environment),
    ).normalize();
    shadow.quaternion.setFromUnitVectors(shadowAxis, shadowNormal);
    shadow.rotateZ(heading);
    shadow.material.uniforms.opacity.value = 0.24 / (1 + altitude * 0.15);
    // Anchor the camera to the car every frame; only turns and the small speed offset ease.
    const portrait = camera.aspect < 0.8;
    const desiredBehind = chaseDistance(speed, portrait);
    if (!hasCarPosition) {
      chaseHeading = heading;
      chaseBehind = desiredBehind;
    }
    chaseHeading += Math.atan2(Math.sin(heading - chaseHeading), Math.cos(heading - chaseHeading)) * (1 - Math.exp(-dt * 10));
    chaseBehind = THREE.MathUtils.damp(chaseBehind, desiredBehind, 5, dt);
    const behind = chaseBehind;
    const target = new THREE.Vector3(
      car.position.x - Math.sin(chaseHeading) * behind,
      car.position.y + 3.2 + (behind - (portrait ? 9.5 : 8)) * 0.15,
      -distance + Math.cos(chaseHeading) * behind,
    );
    // Pull the chase camera in before it passes through a building or tree.
    const cameraContact = sweepScenery(
      { x: car.position.x, y: car.position.y + 1.8, z: car.position.z },
      { x: target.x, y: target.y, z: target.z },
      nearbySolids(car.position.x, distance, behind + 5), 0.35, 0.35,
    );
    if (cameraContact.hit) target.set(cameraContact.x, cameraContact.y, cameraContact.z);
    const cameraGround = drivingSurface(-target.z, target.x, environment);
    target.y = Math.max(target.y, cameraGround + 1.5);
    // Apply collision clearance after following, so smoothing cannot move the view through walls.
    camera.position.copy(target);
    chaseLookAhead = THREE.MathUtils.damp(
      chaseLookAhead,
      flipTime >= 0 ? 2 : 4,
      8,
      dt,
    );
    chaseLookHeight = THREE.MathUtils.damp(
      chaseLookHeight,
      flipTime >= 0 ? 0 : 0.7,
      8,
      dt,
    );
    const lookAhead = chaseLookAhead;
    camera.lookAt(
      car.position.x + Math.sin(heading) * lookAhead,
      Math.max(
        car.position.y + chaseLookHeight,
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
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      portrait ? 57 : 44,
      2,
      dt,
    );
    // More depth precision at altitude prevents distant asphalt and paint from flickering.
    camera.near = Math.min(2, 0.5 + altitude * 0.004);
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
    // Only the neon city needs bloom; the coast keeps crisp natural daylight.
    if (environment === "cyber") composer.render();
    else renderer.render(scene, camera);
    if (now - lastReport > 100) {
      report({
        // Keep the dashboard and audio based on speed magnitude, with a separate reverse indicator.
        speed: Math.round(Math.abs(speed)),
        reversing: speed < -0.1,
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
        surface: Math.abs(lane) > ROAD_HALF_WIDTH ? "offroad" : "road",
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
        // Release per-instance buffers when scenery leaves the streamed world.
        if (o instanceof THREE.InstancedMesh) o.dispose();
        if (o.userData.ownedTexture instanceof THREE.Texture)
          o.userData.ownedTexture.dispose();
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    cityWindows.dispose();
    composer.dispose();
    bloom.dispose();
    outputPass.dispose();
    broadleafTexture.dispose();
    meadowTexture.dispose();
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
