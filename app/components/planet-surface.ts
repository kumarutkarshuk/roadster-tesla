import * as THREE from "three";
import type { CityBox } from "./city-layout";
import type { Planet } from "./journey";

// Wide craters and shallow ridges let the car drive across Moon and Mars without sharp steps.
function relief(x: number, z: number, planet: Planet) {
  let h = Math.sin(x * .003) * Math.cos(z * .004) * 14
    + Math.sin(x * .012 + z * .009) * 2;
  const cx = Math.floor(x / 400), cz = Math.floor(z / 400);
  for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) {
    const seed = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    const rand = seed - Math.floor(seed);
    const radius = 65 + rand * 65;
    const d = Math.hypot(x - (a * 400 + 170), z - (b * 400 + 220)) / radius;
    h += -16 * Math.exp(-d * d * 3) + 5 * Math.exp(-Math.pow((d - 1) * 5, 2));
  }
  return h * (planet === "mars" ? .7 : 1);
}

// Collision height uses the same triangles as the rendered terrain, including wheel contacts.
export function planetHeight(x: number, z: number, planet: Planet) {
  const step = 16, gx = Math.floor(x / step) * step, gz = Math.floor(z / step) * step;
  const u = (x - gx) / step, v = (z - gz) / step;
  const a = relief(gx, gz, planet), b = relief(gx + step, gz, planet);
  const c = relief(gx, gz + step, planet), d = relief(gx + step, gz + step, planet);
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Dense ground near the tyres expands into a curved horizon without a visible patch edge.
export function createPlanetSurface(scene: THREE.Scene, maps = {moon:new THREE.Texture(),mars:new THREE.Texture()}) {
  const geometry = new THREE.PlaneGeometry(4096, 4096, 256, 256);
  geometry.rotateX(-Math.PI / 2);
  // Keep the central driving grid exact; outer rings extend beyond the visible horizon.
  const coords = geometry.attributes.position;
  const stretch = (v: number) => Math.abs(v) <= 1536 ? v : Math.sign(v) * (1536 + Math.pow((Math.abs(v)-1536)/512, 3)*260000);
  // Expand whole square rings together, avoiding thin strips that run to the horizon.
  for(let i=0;i<coords.count;i++) {
    const x=coords.getX(i),z=coords.getZ(i),edge=Math.max(Math.abs(x),Math.abs(z));
    const scale=edge>0?stretch(edge)/edge:1;
    coords.setX(i,x*scale);coords.setZ(i,z*scale);
  }
  const material = new THREE.MeshStandardMaterial({ color: "#85817b", roughness: .96, transparent: true });
  // Ground and orbital views sample the same planet photographs at the landing latitude.
  const surfaceMap={value:maps.moon}, surfaceRadius={value:1737000};
  // Fine grain adds rock detail without making the driving surface bumpy at tyre scale.
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceMap=surfaceMap; shader.uniforms.surfaceRadius=surfaceRadius;
    shader.vertexShader = 'varying vec3 surfacePoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfacePoint=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader = `uniform sampler2D surfaceMap; uniform float surfaceRadius; varying vec3 surfacePoint;
      // Broad rock colour varies in world metres, so near and far ground share one material.
      float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+vec2(1,1)),f.x),f.y);}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain=fract(sin(dot(floor(surfacePoint.xz*18.),vec2(12.9898,78.233)))*43758.5453);
      float strata=sin(surfacePoint.x*.31+sin(surfacePoint.z*.15))*sin(surfacePoint.z*.23);
      // Sub-pixel rock grain fades to its average, keeping distant ground steady.
      float detail=1.-smoothstep(.03,.2,max(length(dFdx(surfacePoint.xz)),length(dFdy(surfacePoint.xz))));
      grain=mix(.5,grain,detail);
      strata*=1.-smoothstep(1.,12.,max(length(dFdx(surfacePoint.xz)),length(dFdy(surfacePoint.xz))));
      vec3 n=normalize(vec3(surfacePoint.x,surfaceRadius+surfacePoint.y,surfacePoint.z));
      vec3 mapped=vec3(n.x,n.y*.54-n.z*.841665,n.y*.841665+n.z*.54);
      vec2 uv=vec2(atan(mapped.z,mapped.x)/6.283185+.5,asin(mapped.y)/3.141593+.5);
      float footprint=max(length(dFdx(surfacePoint.xz)),length(dFdy(surfacePoint.xz)));
      float broad=mix(groundNoise(surfacePoint.xz/180.),.5,smoothstep(90.,360.,footprint));
      float medium=mix(groundNoise(surfacePoint.xz/24.),.5,smoothstep(12.,48.,footprint));
      diffuseColor.rgb=texture2D(surfaceMap,uv).rgb*(.65+broad*.35+medium*.14+(grain-.5)*.12+strata*.04);`);
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Planet driving surface";
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  // Scattered rocks cast real shadows and give the surface a readable sense of scale.
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  rockGeometry.computeBoundingBox();
  const rockMaterial = new THREE.MeshStandardMaterial({color: "#65615c", roughness: 1});
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 420);
  rocks.name = "Surface rocks";
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  const dummy = new THREE.Object3D();
  // A small research lander and solar panels provide human scale on the empty surface.
  const station = new THREE.Group(); scene.add(station);
  const metal = new THREE.MeshStandardMaterial({color: "#c2b6a1", metalness: .7, roughness: .42});
  const solar = new THREE.MeshStandardMaterial({color: "#142b43", metalness: .55, roughness: .25});
  const addPart = (w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);part.position.set(x,y,z);part.castShadow=true;part.receiveShadow=true;station.add(part);return part;
  };
  addPart(3,2,2.4,0,2.5,0,metal);
  for(const side of [-1,1]) {
    addPart(.18,2.5,.18,side*2,1.25,1.5,metal);addPart(.18,2.5,.18,side*2,1.25,-1.5,metal);
    for(let panel=0;panel<4;panel++)addPart(1.2,.06,2.4,side*(3+panel*1.25),1.8,0,solar);
  }
  addPart(.08,3,.08,0,5,0,metal);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(.7,16,8,0,Math.PI*2,0,.5),metal);dish.position.set(0,6.3,0);dish.rotation.z=.5;station.add(dish);
  const solids: CityBox[] = [];
  let address = "";
  return {
    solids,
    update(x: number, z: number, planet: Planet, altitude: number) {
      mesh.visible = planet !== "earth" && altitude < 20000;
      material.opacity = 1-THREE.MathUtils.smoothstep(altitude,10000,20000);
      rocks.visible = mesh.visible && altitude < 5000;
      station.visible = rocks.visible;
      if (!mesh.visible) return;
      const cx = Math.round(x / 128) * 128, cz = Math.round(z / 128) * 128;
      const next = `${planet}:${cx}:${cz}`;
      if (next === address) return;
      address = next;
      solids.length = 0;
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++)
        {
          const px=positions.getX(i), pz=positions.getZ(i), radius=planet === "moon" ? 1737000 : 3390000;
          const r=Math.hypot(px,pz);
          // Coarse horizon triangles use broad curvature, not undersampled small craters.
          const detail=1-THREE.MathUtils.smoothstep(r,1536,6000);
          const curvature=radius-Math.sqrt(Math.max(0,radius*radius-Math.max(0,r*r-1536*1536)));
          positions.setY(i, planetHeight(px + cx, pz + cz, planet)*detail-curvature);
        }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      mesh.position.set(cx, 0, cz);
      surfaceMap.value=planet === "mars" ? maps.mars : maps.moon;
      surfaceRadius.value=planet === "mars" ? 3390000 : 1737000;
      material.color.set("#ffffff");
      rockMaterial.color.set(planet === "mars" ? "#754d37" : "#65615c");
      for(let i=0;i<420;i++) {
        const gx=Math.floor(cx/128)+i%21-10, gz=Math.floor(cz/128)+Math.floor(i/21)-10;
        const rx=gx*128+Math.sin(gx*127.1+gz*31.7)*48, rz=gz*128+Math.sin(gz*311.7+gx*17.3)*48;
        // World coordinates keep each rock unchanged when the nearby pool moves.
        const seed=Math.sin(gx*93.7+gz*271.3)*43758.5453;
        const identity=seed-Math.floor(seed);
        const size=.2+identity*2.72;
        const rockY = planetHeight(rx,rz,planet)+size*.35;
        dummy.position.set(rx,rockY,rz);
        // Rotated rocks use their transformed geometry bounds, including smaller stones.
        const bounds = new THREE.Box3();
        dummy.rotation.set(identity*7,identity*23,identity*2); dummy.scale.set(size,size*.6,size*1.3);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
        bounds.copy(rockGeometry.boundingBox!).applyMatrix4(dummy.matrix);
        const extent=bounds.getSize(new THREE.Vector3()), middle=bounds.getCenter(new THREE.Vector3());
        solids.push({x:middle.x,y:middle.y,z:middle.z,w:extent.x,h:extent.y,d:extent.z});
      }
      const sx=Math.floor(cx/2048)*2048+120, sz=Math.floor(cz/2048)*2048-180;
      station.position.set(sx,planetHeight(sx,sz,planet),sz);
      solids.push({x:sx,y:station.position.y+2.5,z:sz,w:4,h:5,d:4});
      rocks.instanceMatrix.needsUpdate=true; rocks.computeBoundingSphere();
    },
  };
}
