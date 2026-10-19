import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlasma } from './plasma.ts';

// Gas must stay behind the moving hull during fast ascent, braking, and descent.
test('atmospheric wake trails opposite travel without spawning ahead', () => {
  for (const direction of [1, -1]) {
    const car = new THREE.Group(), scene = new THREE.Scene();
    scene.add(car);
    const plasma = createPlasma(car, scene);
    const wake = scene.getObjectByName('Cooling atmospheric wake');
    for(let frame=0;frame<60;frame++) {
      const speed=direction*(frame<30?32000:400);
      car.position.y+=speed/60;
      plasma.update(.5,frame/60,speed,1/60,new THREE.Vector3(0,speed,0));
      const positions=wake.geometry.attributes.center;
      const fades=wake.geometry.attributes.fade;
      let visible=0, trailing=0;
      for(let i=0;i<fades.count;i++) if(fades.getX(i)>0) {
        visible++;
        const offset=positions.getY(i)-car.position.y;
        assert.ok(direction*offset<1.4);
        if(direction*offset<0) trailing++;
      }
      if(frame>20) assert.ok(visible>0 && trailing/visible>.7);
    }
    plasma.dispose();
  }
});

// Starting ascent clears roof-level gas even after descent or a misleading render-space velocity.
test('ascent keeps flame roots below the chassis through direction changes', () => {
  const car = new THREE.Group(), scene = new THREE.Scene();
  scene.add(car);
  const plasma = createPlasma(car, scene);
  const wake = scene.getObjectByName('Cooling atmospheric wake');
  for (let frame=0;frame<60;frame++) {
    const speed=frame<30?-400:400;
    car.position.y+=speed/60;
    car.rotation.z=.4;
    plasma.update(.8,frame/60,speed,1/60,new THREE.Vector3(30,-400,0));
    if(speed>0) {
      assert.ok(wake.material.uniforms.flow.value.y<0);
      const {center,fade}=wake.geometry.attributes;
      let visible=0;
      for(let i=0;i<fade.count;i++) if(fade.getX(i)>0) {
        visible++;
        assert.ok(center.getY(i)<=car.position.y);
      }
      assert.ok(visible>0);
    }
  }
  plasma.dispose();
});
