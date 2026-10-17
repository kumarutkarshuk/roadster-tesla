import * as THREE from "three";
import { center, drivingSurface } from "./terrain";
import { cityRandom as random, type CityBox } from "./city-layout";

// Connected woodland covers the inland hills instead of isolated, repeated roadside trees.
export function makeCoastalForest(index: number, solids: CityBox[]) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  for (let lobe = 0; lobe < 3; lobe++) {
    const part = new THREE.IcosahedronGeometry(1, 1);
    const vertices = part.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const y = vertices.getY(i);
      positions.push(vertices.getX(i) * (2.1 + lobe * 0.15) + Math.sin(lobe * 2.4) * 1.2,
        y * (2.8 - lobe * 0.2) + 4.7 + lobe * 0.3,
        vertices.getZ(i) * 2.2 + Math.cos(lobe * 2.4) * 1.3);
      const normal = new THREE.Vector3(vertices.getX(i) / (2.1 + lobe * 0.15), y / (2.8 - lobe * 0.2), vertices.getZ(i) / 2.2).normalize();
      normals.push(normal.x, normal.y, normal.z);
      const shade = 0.65 + (y + 1) * 0.175;
      colors.push(shade, shade, shade);
    }
    part.dispose();
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const forest = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
    color: "#80936c", vertexColors: true, roughness: 1,
  }), 650);
  // Distant trees still have visible trunks when approached from the air.
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.25, 3.8, 5),
    new THREE.MeshStandardMaterial({ color: "#706d58", roughness: 1 }), forest.count);
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < forest.count; i++) {
    const seed = index * 10657 + i * 23;
    const t = index * 160 + random(seed) * 160;
    // Overlapping groves leave occasional natural clearings between the wooded slopes.
    const grove = Math.floor(random(seed + 1) * 12);
    const offset = 125 + grove * 115 + random(seed + 2) * 95;
    const scale = 0.8 + random(seed + 3) * 1.25;
    const y = drivingSurface(t, center(t) + offset, "coast");
    dummy.position.set(center(t) + offset, y, -t);
    dummy.scale.set(scale * (0.85 + random(seed + 4) * 0.4), scale, scale);
    dummy.rotation.y = random(seed + 5) * Math.PI * 2;
    dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 1.9 * scale;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    tint.setHSL(0.23 + random(seed + 6) * 0.055, 0.2 + random(seed + 7) * 0.15, 0.38 + random(seed + 8) * 0.15);
    forest.setColorAt(i, tint);
    // Foliage is soft: keep the spaces below and between crowns open to the car.
    const trunkWidth = 0.5 * Math.max(dummy.scale.x, dummy.scale.z);
    solids.push({ x: dummy.position.x, y: y + 1.9 * scale, z: -t,
      w: trunkWidth, h: 3.8 * scale, d: trunkWidth });
  }
  forest.receiveShadow = true;
  const group = new THREE.Group();
  group.add(forest, trunks);
  return group;
}

// Broad colour variation and a second texture scale hide the repeated grass-tile pattern.
export function naturalGround(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 meadowPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      meadowPosition = (modelMatrix * vec4(transformed, 1.)).xz;
    `);
    shader.fragmentShader = "varying vec2 meadowPosition;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      #include <map_fragment>
      float meadowPatch = sin(meadowPosition.x * .019 + sin(meadowPosition.y * .013) * 2.)
        * sin(meadowPosition.y * .023 + meadowPosition.x * .006);
      vec3 broadGrass = texture2D(map, vMapUv * .137 + vec2(.31, .57)).rgb;
      diffuseColor.rgb *= mix(vec3(.78, .86, .69), vec3(1.08, 1.04, .87), meadowPatch * .5 + .5);
      diffuseColor.rgb *= mix(vec3(1.), broadGrass * 2.2, .22);
    `);
  };
}
