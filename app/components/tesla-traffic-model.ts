import * as THREE from "three";

export type TeslaTrafficModel = "Model 3" | "Model Y" | "Cybertruck";

// Original simplified meshes follow Tesla's sedan, SUV and angular pickup silhouettes.
// References: tesla.com/model3, tesla.com/modely, tesla.com/cybertruck (no copied assets).
export function makeTrafficModel(kind: TeslaTrafficModel, paint: string) {
  const car = new THREE.Group(); car.name = `Tesla ${kind}`;
  const truck = kind === "Cybertruck", suv = kind === "Model Y";
  const length = truck ? 5.68 : 4.75, width = truck ? 2.2 : 1.92;
  const height = truck ? 1.8 : suv ? 1.62 : 1.43;
  const body = new THREE.MeshPhysicalMaterial({color: truck ? "#9da5a9" : paint, metalness: truck ? .86 : .55, roughness: truck ? .37 : .24, clearcoat: truck ? .2 : 1});
  const glass = new THREE.MeshPhysicalMaterial({color: "#101c26", metalness: .38, roughness: .16, clearcoat: 1});
  const trim = new THREE.MeshStandardMaterial({color: "#16191c", roughness: .7});
  const white = new THREE.MeshStandardMaterial({color:"#eaf4ff",emissive:"#c9e6ff",emissiveIntensity:1.4});
  const red = new THREE.MeshStandardMaterial({color:"#c61116",emissive:"#ed1016",emissiveIntensity:1.2});
  const box = (w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;car.add(mesh);return mesh;
  };
  // A cross-section loft gives curved sedan shoulders and a sharp steel truck roof.
  const loft = (rings: number[][], material: THREE.Material) => {
    const vertices:number[] = [], indices:number[]=[];
    rings.forEach(([z,w,bottom,top]) => {
      vertices.push(-w,bottom,z,w,bottom,z,w,top-.08,z,w*.78,top,z,-w*.78,top,z,-w,top-.08,z);
    });
    for(let r=0;r<rings.length-1;r++)for(let j=0;j<6;j++){
      const a=r*6+j,b=r*6+(j+1)%6,c=a+6,d=b+6;indices.push(a,b,c,b,d,c);
    }
    for(let j=1;j<5;j++){indices.push(0,j+1,j);const end=(rings.length-1)*6;indices.push(end,end+j,end+j+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;car.add(mesh);
  };
  const half=width/2, front=-length/2, rear=length/2;
  loft([[front,half*.83,.36,.71],[front+.45,half,.3,.91],[0,half,.3,.96],[rear-.35,half*.98,.36,.91],[rear,half*.86,.43,.82]],body);
  if(truck){
    loft([[-1.75,half*.9,.86,.89],[-.42,half*.87,.87,height],[1.3,half*.88,.86,1.35],[2.4,half*.89,.84,.98]],body);
    loft([[-1.7,half*.88,.91,.94],[-.42,half*.855,1.02,height+.008],[.65,half*.86,.97,1.61]],glass);
    box(width*.84,.05,.05,0,.89,front-.015,white);
    box(width*.85,.06,.05,0,.98,rear+.015,red);
    box(width*.76,.05,1.5,0,1.08,1.72,trim);
  } else {
    loft([[-1.38,half*.87,.89,.94],[-.55,half*.8,.93,height-.03],[.45,half*.8,.94,height],[1.45,half*.87,.9,suv?1.19:1.02]],glass);
    // Painted roof pillars and separate light signatures keep the two body styles readable.
    box(.08,height-.9,.09,half*.81,(height+.9)/2,.35,body);box(.08,height-.9,.09,-half*.81,(height+.9)/2,.35,body);
    for(const side of [-1,1]){
      box(.52,.065,.06,side*.61,.77,front-.015,white);
      box(.53,.09,.06,side*.61,.81,rear+.015,red);
      box(.19,.11,.29,side*1.02,1.07,-.65,body);
      for(const z of [-.45,.65])box(.16,.025,.035,side*(half+.005),.91,z,trim);
    }
    if(suv)box(1.12,.035,.05,0,.85,rear+.02,red);
  }
  // Four rubber tyres and alloy hubs rotate with road speed in either travel direction.
  const wheels:THREE.Group[]=[];
  const rubber=new THREE.MeshStandardMaterial({color:"#111214",roughness:.95});
  const alloy=new THREE.MeshStandardMaterial({color:"#777e85",metalness:.8,roughness:.3});
  const radius=truck?.43:.34;
  for(const side of [-1,1])for(const z of [-length*.3,length*.3]){
    const wheel=new THREE.Group();wheel.position.set(side*half,radius,z);
    const tyre=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.25,truck?12:20),rubber);tyre.rotation.z=Math.PI/2;tyre.castShadow=true;wheel.add(tyre);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.68,radius*.68,.26,10),alloy);hub.rotation.z=Math.PI/2;wheel.add(hub);car.add(wheel);wheels.push(wheel);
  }
  return {car,wheels,length,width,height,radius};
}
