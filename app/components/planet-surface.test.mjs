import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { planetHeight, createPlanetSurface } from "./planet-surface.ts";

// Rendering and tyre collision agree even after the terrain patch follows a long drive.
test("planet terrain matches visible triangle heights and streams across the drive", () => {
  const scene = new THREE.Scene();
  const surface = createPlanetSurface(scene);
  const ray = new THREE.Raycaster();
  for (const planet of ["moon", "mars"]) {
    for (const x of [-1000, 35, 4090]) {
      surface.update(x, 79, planet, 0);
      scene.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(x,200,79), new THREE.Vector3(0,-1,0));
      const hit = ray.intersectObjects(scene.children)[0];
      assert.ok(hit);
      assert.ok(Math.abs(hit.point.y-planetHeight(x,79,planet)) < .0001);
    }
  }
  surface.update(0,0,"earth",0);
  assert.equal(scene.getObjectByName("Planet driving surface").visible,false);
});

// Crossing a streaming boundary must not resize or rotate existing rocks.
test("Mars rocks keep identical transforms when the player crosses a terrain cell", () => {
  const scene=new THREE.Scene(),surface=createPlanetSurface(scene);
  const snapshot=()=>{
    const rocks=scene.getObjectByName("Surface rocks"),matrix=new THREE.Matrix4(),result=new Map();
    for(let i=0;i<rocks.count;i++) {rocks.getMatrixAt(i,matrix);const e=[...matrix.elements];result.set(`${e[12]}:${e[14]}`,e);}
    return result;
  };
  surface.update(0,0,"mars",0);const before=snapshot();
  surface.update(128,128,"mars",0);const after=snapshot();let shared=0;
  for(const [key,value] of before)if(after.has(key)){assert.deepEqual(after.get(key),value);shared++;}
  assert.ok(shared>350);
});

// Every stone, including small rotated ones, must fit inside its collision box.
test("all visible rocks have collision bounds enclosing their mesh", () => {
  const scene=new THREE.Scene(),surface=createPlanetSurface(scene);
  surface.update(0,0,"moon",0);
  const rocks=scene.getObjectByName("Surface rocks"),matrix=new THREE.Matrix4();
  assert.equal(surface.solids.length,rocks.count+1);
  rocks.geometry.computeBoundingBox();
  for(let i=0;i<rocks.count;i++) {
    rocks.getMatrixAt(i,matrix);
    const bounds=rocks.geometry.boundingBox.clone().applyMatrix4(matrix),box=surface.solids[i];
    assert.ok(Math.abs(bounds.min.x-(box.x-box.w/2))<.001);
    assert.ok(Math.abs(bounds.max.y-(box.y+box.h/2))<.001);
    assert.ok(Math.abs(bounds.max.z-(box.z+box.d/2))<.001);
  }
});

// Far ground follows smooth planet curvature instead of stretching tiny craters into ridges.
test("distant Moon and Mars terrain stays smooth beyond the driving grid", () => {
  const scene = new THREE.Scene(), surface = createPlanetSurface(scene);
  for (const planet of ["moon", "mars"]) {
    surface.update(0, 0, planet, 2100);
    const positions = scene.getObjectByName("Planet driving surface").geometry.attributes.position;
    const radius = planet === "moon" ? 1737000 : 3390000;
    let checked = 0;
    for (let i = 0; i < positions.count; i++) {
      const r = Math.hypot(positions.getX(i), positions.getZ(i));
      if (r < 6000) continue;
      const expected = Math.sqrt(radius * radius - (r * r - 1536 * 1536)) - radius;
      assert.ok(Math.abs(positions.getY(i) - expected) < .01);
      checked++;
    }
    assert.ok(checked > 1000);
  }
});
