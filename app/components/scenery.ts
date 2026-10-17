import * as THREE from "three";

export function makeSurfaceTexture(kind: "grass" | "asphalt") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(256, 256);
  let seed = 173;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < data.data.length; i += 4) {
    const n = kind === "asphalt" ? 160 + noise() * 75 : 175 + noise() * 55;
    data.data[i] = n;
    data.data[i + 1] = n;
    data.data[i + 2] = n;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  if (kind === "grass") {
    for (let i = 0; i < 3000; i++) {
      const x = noise() * 256,
        y = noise() * 256;
      ctx.strokeStyle = `rgba(70,78,52,${noise() * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + noise() * 3 - 1, y - 2 - noise() * 5);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function makeSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1900, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color("#64788f") },
        horizon: { value: new THREE.Color("#e7a37d") },
        glow: { value: new THREE.Color("#ffce92") },
        cloud: { value: new THREE.Color("#d8b6ac") },
        sunDirection: {
          value: new THREE.Vector3(-0.48, 0.065, -1).normalize(),
        },
        strength: { value: 1 },
        time: { value: 0 },
      },
      vertexShader:
        "varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `
      varying vec3 direction;
      uniform vec3 top,horizon,glow,cloud,sunDirection;
      uniform float strength,time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.03+3.7;a*=.5;}return n;}
      void main(){
        vec3 ray=normalize(direction);float h=max(ray.y,0.);
        vec3 color=mix(horizon,top,pow(smoothstep(-.02,.65,ray.y),.55));
        float sd=max(dot(ray,sunDirection),0.);
        color+=glow*pow(sd,18.)*.24*strength;
        color+=glow*pow(sd,180.)*.65*strength;
        color+=vec3(1.,.88,.67)*smoothstep(.99975,.9999,sd)*2.*strength;
        vec2 p=ray.xz/max(.08,ray.y+.15)*2.3+vec2(time*.001,0.);
        float c=fbm(p*vec2(.7,2.8));
        float coverage=smoothstep(.49,.72,c)*smoothstep(.015,.15,h)*(1.-smoothstep(.55,.9,h));
        vec3 litCloud=mix(cloud,glow,.35*pow(sd,8.));
        color=mix(color,litCloud,coverage*.78);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
}

export function makeOcean() {
  return new THREE.Mesh(
    // Small surface waves and shallow-water colour make the shoreline readable.
    new THREE.PlaneGeometry(5000, 5000, 180, 180),
    new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color("#496671") },
        sunColor: { value: new THREE.Color("#ffbb80") },
        sunDirection: {
          value: new THREE.Vector3(-0.48, 0.065, -1).normalize(),
        },
        strength: { value: 1 },
        fogColor: { value: new THREE.Color("#b69e91") },
      },
      vertexShader:
        "uniform float time;varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;world.y+=sin(world.x*.045+world.z*.025+time*.65)*.16;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}",
      fragmentShader: `varying vec3 world;uniform float time,strength;uniform vec3 color,sunColor,sunDirection,fogColor;
    void main(){
      vec2 p=world.xz;
      float a=sin(p.x*.24+p.y*.1+time*.8)*.11+sin(p.x*.7-p.y*.32+time*1.4)*.035;
      a+=sin(p.x*1.7+p.y*.8+time*1.9)*.023;
      float b=cos(p.y*.25+p.x*.13+time*.6)*.09+cos(p.y*1.1-p.x*.5+time*1.2)*.025;
      vec3 n=normalize(vec3(a,1.,b));vec3 v=normalize(cameraPosition-world);
      float fresnel=pow(1.-max(dot(n,v),0.),3.);
      float shine=pow(max(dot(reflect(-sunDirection,n),v),0.),95.);
      float t=-world.z;
      float roadX=sin(t/420.)*48.+sin(t/970.)*76.;
      float roadY=12.+sin(t/340.)*3.+sin(t/730.)*4.;
      float depth=max(0.,(roadX-18.-world.x)*.65-roadY-5.);
      vec3 shallow=mix(color,vec3(.08,.4,.37),strength*.45);
      vec3 c=mix(shallow,color,smoothstep(0.,22.,depth));
      c=mix(c,fogColor,fresnel*.38)+sunColor*shine*strength*2.;
      float surf=pow(.5+.5*sin(depth*1.8-time*1.3+sin(p.y*.17)),5.);
      c+=vec3(.63,.74,.7)*surf*(1.-smoothstep(0.,3.8,depth))*.55*strength;
      float fog=1.-exp(-length(cameraPosition-world)*.00065);c=mix(c,fogColor,fog);
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  );
}

/** Original alpha-cutout vegetation, painted procedurally rather than solid cones. */
export function makeVegetationTexture(grass = false, broadleaf = false) {
  const canvas = document.createElement("canvas");
  canvas.width = grass ? 128 : 512;
  canvas.height = grass ? 256 : 1024;
  const ctx = canvas.getContext("2d")!;
  let seed = 491;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  if (grass) {
    for (let i = 0; i < 70; i++) {
      const x = random() * 128,
        top = 25 + random() * 180;
      ctx.strokeStyle = ["#68764b", "#84935b", "#9b9d69", "#56613f"][i % 4];
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.quadraticCurveTo(
        x + (random() - 0.5) * 55,
        150,
        x + (random() - 0.5) * 75,
        top,
      );
      ctx.stroke();
    }
  } else if (broadleaf) {
    ctx.strokeStyle = "#8b8973";
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(256, 1024);
    ctx.lineTo(251, 345);
    ctx.stroke();
    for (let branch = 0; branch < 24; branch++) {
      const angle = random() * Math.PI * 2,
        radius = Math.sqrt(random());
      const cx = 256 + Math.cos(angle) * radius * 160,
        cy = 380 + Math.sin(angle) * radius * 255;
      ctx.strokeStyle = "#726f58";
      ctx.lineWidth = 4 + random() * 5;
      ctx.beginPath();
      ctx.moveTo(255, 730);
      ctx.quadraticCurveTo(250, cy + 130, cx, cy);
      ctx.stroke();
      for (let leaf = 0; leaf < 420; leaf++) {
        const a = random() * Math.PI * 2,
          r = Math.sqrt(random()),
          px = cx + Math.cos(a) * r * 78,
          py = cy + Math.sin(a) * r * 100;
        const light = (1 - r) * 12 + (1 - px / 512) * 20 + random() * 33;
        ctx.fillStyle = `rgb(${42 + light * 0.75},${68 + light},${24 + light * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(
          px,
          py,
          3 + random() * 6,
          2 + random() * 4,
          random() * 3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = "#70664d";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(256, 1024);
    ctx.lineTo(256, 12);
    ctx.stroke();
    for (let layer = 0; layer < 27; layer++) {
      const y = 30 + layer * 33,
        width = 14 + layer * 7.6;
      for (const sign of [-1, 1]) {
        const tipX = 256 + sign * width,
          tipY = y + 30 + random() * 30;
        ctx.strokeStyle = "#4a5235";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(256, y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        for (let j = 0; j < 190; j++) {
          const u = random(),
            x = 256 + sign * width * u + (random() - 0.5) * 22,
            py = y + (tipY - y) * u + (random() - 0.5) * (35 + layer * 1.4);
          const g = 40 + Math.floor(random() * 46);
          ctx.fillStyle = `rgb(${Math.floor(g * 0.78)},${g},${Math.floor(g * 0.62)})`;
          ctx.beginPath();
          ctx.ellipse(
            x,
            py,
            3 + random() * 8,
            1 + random() * 3,
            sign * -0.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export function makePineGeometry(grass = false, broadleaf = false) {
  const positions: number[] = [],
    uvs: number[] = [];
  const width = grass ? 1.2 : broadleaf ? 8.2 : 5.7,
    height = grass ? 0.85 : 9;
  for (let side = 0; side < 3; side++) {
    const angle = (side * Math.PI) / 3,
      dx = (Math.cos(angle) * width) / 2,
      dz = (Math.sin(angle) * width) / 2;
    const bottom = grass ? 0 : -height / 2,
      top = grass ? height : height / 2;
    positions.push(
      -dx,
      bottom,
      -dz,
      dx,
      bottom,
      dz,
      -dx,
      top,
      -dz,
      dx,
      bottom,
      dz,
      dx,
      top,
      dz,
      -dx,
      top,
      -dz,
    );
    uvs.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Original repeating dry-stone texture with uneven courses and lichen. */
export function makeStoneTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 1149;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = "#424538";
  ctx.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 7; row++) {
    let x = -50 + random() * 50;
    const y = row * 37;
    while (x < 512) {
      const w = 30 + random() * 55,
        h = 29 + random() * 6,
        n = 65 + random() * 40;
      ctx.fillStyle = `rgb(${n + 9},${n + 10},${n - 1})`;
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3);
      ctx.lineTo(x + w - 4, y + random() * 5);
      ctx.lineTo(x + w, y + h - 2);
      ctx.lineTo(x + random() * 5, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#c4c3a14a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 4);
      ctx.lineTo(x + w - 6, y + 3);
      ctx.stroke();
      for (let j = 0; j < 15; j++) {
        ctx.fillStyle = j % 3 ? "#252c2120" : "#a7ab7160";
        ctx.fillRect(
          x + random() * w,
          y + random() * h,
          2 + random() * 5,
          1 + random() * 3,
        );
      }
      x += w + 2;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Layered leaf cards distributed through a crown, not a whole-tree billboard. */
export function makeBroadleafGeometry() {
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [];
  let seed = 219;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const point = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  for (let clump = 0; clump < 42; clump++) {
    const y = -1.6 + random() * 4.5,
      angle = clump * 2.39996;
    const r =
      Math.sqrt(Math.max(0.1, 1 - ((y - 0.5) / 3) ** 2)) *
      (1.2 + random() * 1.3);
    const center = new THREE.Vector3(
      Math.cos(angle) * r,
      y,
      Math.sin(angle) * r,
    );
    const size = 1.5 + random() * 0.8,
      shade = 0.65 + random() * 0.35;
    for (let card = 0; card < 3; card++) {
      rotation.setFromEuler(
        new THREE.Euler(
          (random() - 0.5) * 1.1,
          angle + (card * Math.PI) / 3,
          (random() - 0.5) * 0.7,
        ),
      );
      for (const [x, y] of corners) {
        point
          .set(x * size, y * size, 0)
          .applyQuaternion(rotation)
          .add(center);
        positions.push(point.x, point.y, point.z);
        uvs.push(x + 0.5, y + 0.5);
        colors.push(shade, shade, shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function makeGrassGeometry() {
  const positions: number[] = [],
    colors: number[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.3999,
      r = 0.15 + (i % 3) * 0.2,
      x = Math.cos(angle) * r,
      z = Math.sin(angle) * r;
    const height = 0.18 + (i % 4) * 0.065,
      width = 0.015 + (i % 3) * 0.006,
      dx = Math.cos(angle + 1) * width,
      dz = Math.sin(angle + 1) * width;
    const leanX = Math.cos(angle) * 0.1,
      leanZ = Math.sin(angle) * 0.1;
    positions.push(
      x - dx,
      0,
      z - dz,
      x + dx,
      0,
      z + dz,
      x + leanX,
      height,
      z + leanZ,
    );
    colors.push(0.42, 0.48, 0.23, 0.5, 0.56, 0.28, 0.78, 0.82, 0.46);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export function makeNormalMap(source: THREE.CanvasTexture, strength: number) {
  const input = source.image as HTMLCanvasElement,
    canvas = document.createElement("canvas");
  canvas.width = input.width;
  canvas.height = input.height;
  const w = canvas.width,
    h = canvas.height,
    ctx = canvas.getContext("2d")!,
    pixels = input.getContext("2d")!.getImageData(0, 0, w, h).data,
    data = ctx.createImageData(w, h);
  const gray = (x: number, y: number) =>
    pixels[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (gray(x - 1, y) - gray(x + 1, y)) * strength,
        dy = (gray(x, y - 1) - gray(x, y + 1)) * strength,
        n = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      data.data[i] = ((dx / n) * 0.5 + 0.5) * 255;
      data.data[i + 1] = ((dy / n) * 0.5 + 0.5) * 255;
      data.data[i + 2] = ((1 / n) * 0.5 + 0.5) * 255;
      data.data[i + 3] = 255;
    }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function makeBranchGeometry() {
  const positions: number[] = [];
  const up = new THREE.Vector3(0, 1, 0),
    rotation = new THREE.Quaternion();
  for (let i = 0; i < 14; i++) {
    const a = i * 2.3999,
      start = new THREE.Vector3(0, -3.1 + i * 0.1, 0),
      end = new THREE.Vector3(
        Math.cos(a) * (1.7 + (i % 3) * 0.3),
        -0.1 + (i % 5) * 0.55,
        Math.sin(a) * (1.7 + (i % 3) * 0.3),
      );
    const delta = end.clone().sub(start);
    rotation.setFromUnitVectors(up, delta.clone().normalize());
    const g = new THREE.CylinderGeometry(
      0.025,
      0.12 - i * 0.004,
      delta.length(),
      7,
    ).toNonIndexed();
    g.applyQuaternion(rotation);
    g.translate(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    );
    positions.push(...g.attributes.position.array);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
