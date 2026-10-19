import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { center, drivingSurface } from './terrain.ts';
import { sweepScenery } from './city-layout.ts';

// Resolve the game's extensionless TypeScript imports for the Node test runner.
registerHooks({resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
}});
const { createTraffic } = await import('./traffic.ts');

// Oncoming traffic must stop outside a stationary car, including on curved roads.
test('traffic cannot drive into a stopped player', () => {
  const scene=new THREE.Scene(), traffic=createTraffic(scene);
  const t=415, x=center(t)-5.75, y=drivingSurface(t,x,'cyber');
  for(let frame=0;frame<300;frame++) {
    traffic.update(t,x,1/60,'cyber',true,y,0);
    const car=traffic.boxes[1];
    assert.ok(Math.abs(car.z+t)>=car.d/2+2.5 || Math.abs(car.x-x)>=car.w/2+1.3);
  }
});

// The player cannot tunnel through a visible car when boosting towards it.
test('traffic collision boxes stop a fast player', () => {
  const traffic=createTraffic(new THREE.Scene());
  const t=240,x=center(t)+5.75,y=drivingSurface(t,x,'cyber');
  traffic.update(t-40,x,0,'cyber',true,y,0);
  const hit=sweepScenery({x,y,z:-t+20},{x,y,z:-t-20},traffic.boxes,0,1.8,{heading:0,halfWidth:1.3,halfLength:2.5});
  assert.equal(hit.hit,true);
  assert.ok(hit.z>-t+4);
});
