import * as THREE from "three";

export type GasOutlet = {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  kind: "lift" | "boost" | "roll" | "yaw";
  torque: number;
  nozzle?: THREE.Object3D;
  carry: number;
};

// The smoothstep roll has positive angular acceleration in its first half,
// negative acceleration in its second half, and zero torque at the midpoint.
export function rollJetDemand(progress: number) {
  return progress >= 0 && progress < 1 ? 1 - 2 * progress : 0;
}

/** Ignore tiny heading corrections once the hover/turn has settled. */
export function yawJetDemand(rate: number, previousRate: number, dt: number) {
  if (dt <= 0) return 0;
  const acceleration = (rate - previousRate) / dt;
  if (Math.abs(rate) < 0.025 && Math.abs(acceleration) < 0.08) return 0;
  const demand = THREE.MathUtils.clamp(-(acceleration + rate * 0.8) / 2.4, -1, 1);
  return Math.abs(demand) < 0.035 ? 0 : demand;
}

/** Finite-lived, camera-facing condensation puffs in world space. */
export function createExhaust(scene: THREE.Scene) {
  const capacity = 6400;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const life = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  );
  const seeds = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  );
  const groundMist = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity),
    1,
  );
  geometry.setAttribute("gasGround", groundMist);
  groundMist.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("gasLife", life);
  geometry.setAttribute("gasSeed", seeds);
  life.setUsage(THREE.DynamicDrawUsage);
  seeds.setUsage(THREE.DynamicDrawUsage);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: { light: { value: 1 }, nearPlane: { value: 0.1 } },
    vertexShader: `
      uniform float nearPlane;
      attribute float gasLife;
      attribute float gasSeed;
      attribute float gasGround;
      varying vec2 puffUv;
      varying float age;
      varying float seed;
      varying float groundCloud;
      varying float cameraFade;
      void main() {
        puffUv = uv; age = gasLife; seed = gasSeed; groundCloud = gasGround;
        vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        // Fade before a close camera clips through the particle plane.
        cameraFade = smoothstep(nearPlane, nearPlane + 1.2, -viewPosition.z);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float light;
      varying vec2 puffUv;
      varying float age;
      varying float seed;
      varying float groundCloud;
      varying float cameraFade;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = puffUv * 2.0 - 1.0;
        float turbulence = noise(p*4.0 + seed + age*3.0) * 0.65
                         + noise(p*9.0 - age*5.0 + seed) * 0.35;
        float edge = 1.0 - smoothstep(0.2, 1.0, length(p) + (turbulence-0.5)*0.3);
        float density = edge * (0.55 + turbulence*0.45);
        float alpha = density * pow(1.0-age, mix(1.6, 1.15, groundCloud)) * mix(0.42, 0.18, groundCloud) * cameraFade;
        if (alpha < 0.004) discard;
        // Neutral condensation, not an emissive flame. A shaded edge preserves
        // contrast against the sky while the core reads against dark scenery.
        vec3 shade = mix(vec3(0.40,0.46,0.49),vec3(0.94,0.97,0.98),density);
        gl_FragColor = vec4(shade * light, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = "Pressurized air";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Particle positions move independently of the car; a stale bounding sphere
  // must never cull the entire effect during a roll or at high altitude.
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.count = 0;
  scene.add(mesh);
  const particles = Array.from({ length: capacity }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    age: 1,
    lifetime: 0,
    size: 0,
    seed: 0,
    grounded: false,
    depth: 0,
  }));
  let cursor = 0;
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const inverseRotation = new THREE.Quaternion();
  const localDown = new THREE.Vector3();
  const nozzleAxis = new THREE.Vector3(0, 1, 0);
  const transform = new THREE.Object3D();
  const sorted: typeof particles = [];
  const previousOutlets = new Map<
    GasOutlet,
    { position: THREE.Vector3; direction: THREE.Vector3 }
  >();
  const emissionDirection = new THREE.Vector3();
  const surfaceNormal = new THREE.Vector3();
  const radialFlow = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();

  return {
    update(
      dt: number,
      car: THREE.Object3D,
      camera: THREE.PerspectiveCamera,
      outlets: GasOutlet[],
      velocity: THREE.Vector3,
      lift: number,
      boost: boolean,
      roll: number,
      yaw: number,
      night: boolean,
      surfaceHeight: (x: number, z: number) => number,
    ) {
      car.updateMatrixWorld(true);
      inverseRotation.copy(car.quaternion).invert();
      localDown.set(0, -1, 0).applyQuaternion(inverseRotation);
      for (const p of particles) {
        if (p.age >= p.lifetime) continue;
        p.age += dt;
        // Air drag and small rolling eddies break up straight, tube-like trails.
        const drag = Math.exp(-dt * (p.grounded ? 2.2 : 1.1));
        p.velocity.multiplyScalar(drag);
        if (!p.grounded) {
          p.velocity.x += Math.sin(p.seed + p.age * 7) * dt * 1.8;
          p.velocity.z += Math.cos(p.seed * 1.7 + p.age * 5) * dt * 1.8;
          p.velocity.y += dt * 0.35;
        }
        p.position.addScaledVector(p.velocity, dt);
      }
      for (const outlet of outlets) {
        const strength =
          outlet.kind === "lift"
            ? lift
            : outlet.kind === "boost"
              ? Number(boost)
              : Math.max(
                  0,
                  (outlet.kind === "roll" ? roll : yaw) * outlet.torque,
                );
        // Gimballed lift outlets keep the simplified hover controller's force
        // pointing upward even when the body is inverted during a stunt.
        if (outlet.kind === "lift")
          outlet.nozzle?.quaternion.setFromUnitVectors(nozzleAxis, localDown);
        if (dt <= 0 || strength <= 0.001) {
          outlet.carry = 0;
          if (dt > 0) previousOutlets.delete(outlet);
          continue;
        }
        origin.copy(outlet.position).applyMatrix4(car.matrixWorld);
        direction.copy(outlet.direction).applyQuaternion(car.quaternion);
        if (outlet.kind === "lift") direction.set(0, -1, 0);
        // A small step beyond the nozzle prevents the body from hiding the root.
        origin.addScaledVector(direction, 0.09);
        const previous = previousOutlets.get(outlet) ?? {
          position: origin.clone(),
          direction: direction.clone(),
        };
        outlet.carry +=
          dt *
          (outlet.kind === "yaw"
            ? 380 * Math.sqrt(strength)
            : (outlet.kind === "lift" ? 150 : 240) * Math.sqrt(strength) + strength * 140);
        const count = Math.floor(outlet.carry);
        outlet.carry -= count;
        for (let j = 0; j < count; j++) {
          const p = particles[cursor];
          cursor = (cursor + 1) % capacity;
          const fraction = (j + 0.5) / Math.max(1, count);
          emissionDirection
            .copy(previous.direction)
            .lerp(direction, fraction)
            .normalize();
          // Wider, varied puffs make a turbulent plume while keeping the nozzle root tight.
          const spread = 1.3 + strength * 0.7;
          p.velocity
            .copy(velocity)
            .multiplyScalar(0.85)
            .addScaledVector(emissionDirection, 7 + strength * 7);
          p.velocity.x += (Math.random() - 0.5) * spread;
          p.velocity.y += (Math.random() - 0.5) * spread;
          p.velocity.z += (Math.random() - 0.5) * spread;
          // Interpolate the moving outlet as well as the gas. This keeps a
          // continuous plume while the nozzles sweep through a fast roll.
          p.age = dt * (1 - fraction);
          p.position
            .copy(previous.position)
            .lerp(origin, fraction)
            .addScaledVector(p.velocity, p.age);
          p.lifetime =
            (outlet.kind === "lift" ? 0.48 : 0.55) +
            strength * 0.18 +
            Math.random() * 0.12;
          p.size = (0.22 + strength * 0.12) * (0.8 + Math.random() * 0.4);
          p.seed = Math.random() * 100;
          p.grounded = false;
        }
        previous.position.copy(origin);
        previous.direction.copy(direction);
        previousOutlets.set(outlet, previous);
      }
      sorted.length = 0;
      camera.getWorldDirection(cameraDirection);
      for (const p of particles) {
        if (p.age >= p.lifetime) continue;
        if (dt > 0) {
          const floor = surfaceHeight(p.position.x, p.position.z);
          if (!p.grounded && p.position.y <= floor + 0.12) {
            // Represent the mixed ground flow with fewer, larger eddies instead
            // of stacking every narrow-jet sample into an opaque white sheet.
            if (p.seed % 1 > 0.22) {
              p.age = p.lifetime;
              continue;
            }
            // Redirect the incoming jet along the surface instead of letting
            // it pass through the road. The random azimuth distributes flow
            // around the impact point, forming an expanding wall-jet cloud.
            const step = 0.35;
            surfaceNormal
              .set(
                surfaceHeight(p.position.x - step, p.position.z) -
                  surfaceHeight(p.position.x + step, p.position.z),
                2 * step,
                surfaceHeight(p.position.x, p.position.z - step) -
                  surfaceHeight(p.position.x, p.position.z + step),
              )
              .normalize();
            const impact = Math.max(0, -p.velocity.dot(surfaceNormal));
            radialFlow
              .set(Math.cos(p.seed), 0, Math.sin(p.seed))
              .projectOnPlane(surfaceNormal)
              .normalize();
            p.velocity
              .projectOnPlane(surfaceNormal)
              .multiplyScalar(0.18)
              .addScaledVector(
                radialFlow,
                THREE.MathUtils.clamp(impact * 0.65, 2, 9),
              )
              .addScaledVector(surfaceNormal, 0.25 + Math.random() * 0.35);
            p.position.y = floor + 0.18;
            p.grounded = true;
            p.age = 0;
            // Landing mist clears quickly instead of hiding the car after touchdown.
            p.lifetime = 0.55 + Math.random() * 0.35;
            p.size = 0.65 + Math.min(impact, 18) * 0.025;
          }
          if (p.grounded) {
            const spreadSize = p.size + (p.age / p.lifetime) * 3.2;
            // Rising terrain lifts the cloud; it never sinks through slopes.
            p.position.y = Math.max(
              p.position.y,
              floor + 0.08 + spreadSize * 0.3,
            );
          }
        }
        p.depth = p.position.dot(cameraDirection);
        sorted.push(p);
      }
      // Normal alpha blending needs back-to-front order, including overlapping jets.
      // View depth keeps off-axis puffs in order in the close driver camera.
      sorted.sort((a, b) => b.depth - a.depth);
      sorted.forEach((p, i) => {
        const age = p.age / p.lifetime;
        transform.position.copy(p.position);
        transform.quaternion.copy(camera.quaternion);
        transform.rotateZ(p.seed + age * 0.7);
        transform.scale.setScalar(
          p.size + (p.grounded ? age * 3.2 : age * 1.4 + age * age * 0.8),
        );
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
        life.setX(i, age);
        seeds.setX(i, p.seed);
        groundMist.setX(i, Number(p.grounded));
      });
      mesh.count = sorted.length;
      mesh.instanceMatrix.needsUpdate = true;
      life.needsUpdate = seeds.needsUpdate = groundMist.needsUpdate = true;
      material.uniforms.light.value = night ? 0.6 : 1;
      material.uniforms.nearPlane.value = camera.near;
    },
    clear() {
      for (const p of particles) p.age = p.lifetime;
      mesh.count = 0;
      previousOutlets.clear();
    },
  };
}
