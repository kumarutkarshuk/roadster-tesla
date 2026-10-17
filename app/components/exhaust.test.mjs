import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createExhaust } from "./exhaust.ts";

test("overlapping smoke uses viewing depth instead of radial distance", () => {
  const scene = new THREE.Scene();
  const exhaust = createExhaust(scene);
  const car = new THREE.Object3D();
  car.position.y = 10;
  const camera = new THREE.PerspectiveCamera(57, 390 / 844, 0.1, 2400);
  camera.position.y = 10;
  const outlets = [
    new THREE.Vector3(0, 0, -5),
    new THREE.Vector3(2, 0, -4.8),
  ].map((position) => ({
    position,
    direction: new THREE.Vector3(0, -1, 0),
    kind: "boost",
    torque: 0,
    carry: 0,
  }));
  const update = (dt) => exhaust.update(
    dt, car, camera, outlets, new THREE.Vector3(), 0, true, 0, 0,
    false, () => -100,
  );
  const mesh = scene.getObjectByName("Pressurized air");
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  function assertDepthOrder() {
    camera.getWorldDirection(direction);
    let previousDepth = Infinity;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix).sub(camera.position);
      const depth = position.dot(direction);
      assert.ok(depth <= previousDepth + 0.00001, "farther puffs must render first");
      previousDepth = depth;
    }
  }
  update(0.02);
  assert.ok(mesh.count > 2);
  assertDepthOrder();
  const count = mesh.count;
  // Paused camera changes must reorder existing smoke without respawning it.
  camera.position.set(20, 10, 0);
  camera.lookAt(0, 10, 0);
  camera.near = 0.3;
  update(0);
  assert.equal(mesh.count, count);
  assertDepthOrder();
  assert.equal(mesh.material.uniforms.nearPlane.value, camera.near);
  exhaust.clear();
  mesh.geometry.dispose();
  mesh.material.dispose();
});
