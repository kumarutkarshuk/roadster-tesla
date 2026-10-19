import * as THREE from "three";

// Atmospheric heating follows the actual metal body, never a painted ring around the camera.
export function createPlasma(car: THREE.Group, scene: THREE.Scene) {
  const hull=car.getObjectByName("Roadster body");
  const material=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{heat:{value:0},time:{value:0},travelSign:{value:1},flowDirection:{value:new THREE.Vector3(0,1,0)}},
    vertexShader:`varying vec3 localPoint,viewNormal,viewDirection;varying float leading;
      uniform float travelSign; uniform vec3 flowDirection;
      void main(){localPoint=position;vec4 view=modelViewMatrix*vec4(position+normal*.045,1.);
        viewNormal=normalize(normalMatrix*normal);viewDirection=normalize(-view.xyz);
        leading=pow(max(0.,dot(normal,flowDirection)),2.);
        gl_Position=projectionMatrix*view;}`,
    fragmentShader:`uniform float heat,time;varying vec3 localPoint,viewNormal,viewDirection;varying float leading;
      void main(){
        float rim=pow(1.-abs(dot(normalize(viewNormal),normalize(viewDirection))),2.);
        float flow=.72+.18*sin(localPoint.z*16.-time*19.+sin(localPoint.x*23.))+.1*sin(localPoint.y*41.+time*27.);
        // Bright leading edges make fast entry visible while keeping the body shape readable.
        float alpha=heat*leading*rim*flow*.75;
        // Bright orange edges stay visible against both daylight and dark body panels.
        gl_FragColor=vec4(mix(vec3(1.,.12,.015),vec3(1.,.65,.2),rim*leading),alpha);
      }`,
  });
  const mesh=hull instanceof THREE.Mesh?new THREE.Mesh(hull.geometry.clone(),material):null;
  if(mesh){mesh.name="Atmospheric body heat";mesh.visible=false;car.add(mesh);}
  // Keep the short gas wake relative to the moving hull so it cannot overshoot during climb braking.
  const count=320, positions=new Float32Array(count*3), fades=new Float32Array(count);
  // Overlapping ribbons make a continuous gas flame instead of round glowing dots.
  const plane=new THREE.PlaneGeometry(1,1);
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.index=plane.index;
  geometry.setAttribute("position",plane.attributes.position);
  geometry.setAttribute("uv",plane.attributes.uv);
  geometry.setAttribute("center",new THREE.InstancedBufferAttribute(positions,3));
  geometry.setAttribute("fade",new THREE.InstancedBufferAttribute(fades,1));
  geometry.setAttribute("age",new THREE.InstancedBufferAttribute(new Float32Array(count),1));
  geometry.instanceCount=count;
  const wakeMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0},flow:{value:new THREE.Vector3(0,-1,0)},carHeight:{value:0},climbing:{value:0}},
    vertexShader:`attribute vec3 center;attribute float fade,age;
      uniform vec3 flow;varying vec2 flameUv;varying float opacity,cooling,seed,worldHeight;
      void main(){
        flameUv=uv;opacity=fade;cooling=age;seed=float(gl_InstanceID)*2.39996;
        vec4 view=modelViewMatrix*vec4(center,1.);
        // Face the camera while stretching each tongue along the visible gas flow.
        vec2 projected=(viewMatrix*vec4(flow,0.)).xy;
        float projection=length(projected);
        vec2 axis=projection>.001?projected/projection:vec2(0.,1.);
        vec2 across=vec2(axis.y,-axis.x);
        float width=.48+age*.75;
        float lengthAlong=mix(width,2.4+age*1.8,clamp(projection,0.,1.));
        // Anchor the ribbon at its hot root; extend only behind the moving car.
        vec2 offset=across*position.x*width+axis*uv.y*lengthAlong;
        view.xy+=offset;
        worldHeight=center.y+dot(vec3(offset,0.),viewMatrix[1].xyz);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader:`uniform float time,carHeight,climbing;varying vec2 flameUv;varying float opacity,cooling,seed,worldHeight;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        // The ascent wake stays below the chassis even with a tilted camera or car.
        if(climbing>.5 && worldHeight>carHeight) discard;
        // Rolling eddies break the edges into wisps; the hot root cools to deep orange.
        vec2 p=flameUv;float n=noise(vec2(p.x*5.+seed,p.y*7.-time*9.));
        float fine=noise(vec2(p.x*13.-seed,p.y*17.-time*15.));
        float bend=sin(p.y*7.-time*8.+seed)*.1+(n-.5)*.22;
        float width=mix(.48,.08,p.y);
        float edge=1.-smoothstep(width*.3,width,abs(p.x-.5+bend));
        float ends=smoothstep(0.,.16,p.y)*(1.-smoothstep(.65,1.,p.y));
        float density=edge*ends*(.55+n*.3+fine*.15);
        float hot=clamp((1.-cooling)*.65+edge*.35-p.y*.4,0.,1.);
        vec3 color=mix(vec3(.8,.035,.003),vec3(1.8,.42,.035),smoothstep(.1,.65,hot));
        color=mix(color,vec3(2.5,1.7,.65),smoothstep(.65,1.,hot));
        gl_FragColor=vec4(color,opacity*density*.3);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const wake=new THREE.Mesh(geometry,wakeMaterial);wake.frustumCulled=false;wake.name="Cooling atmospheric wake";scene.add(wake);
  const particles=Array.from({length:count},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:1,heat:0}));
  // Shock-heated gas wraps the leading body and streams opposite actual travel.
  const localFlow=new THREE.Vector3(), inverse=new THREE.Quaternion();
  const previousPosition=new THREE.Vector3(), displacement=new THREE.Vector3(), trailDirection=new THREE.Vector3();
  let positioned=false;
  let cursor=0,carry=0;
  return {update(heat:number,time:number,verticalSpeed:number,dt:number,velocity:THREE.Vector3){
    // Move existing gas with the hull, then stream it opposite the current travel direction.
    displacement.copy(car.position).sub(previousPosition);
    if(positioned) particles.forEach(p=>p.position.add(displacement));
    previousPosition.copy(car.position);positioned=true;
    // Gameplay climb speed avoids terrain and camera-space movement reversing the flame.
    trailDirection.copy(velocity);trailDirection.y=verticalSpeed;trailDirection.normalize();
    // Keep flame animation and ribbon direction tied to the current motion.
    wakeMaterial.uniforms.time.value=time;
    wakeMaterial.uniforms.carHeight.value=car.position.y;
    wakeMaterial.uniforms.climbing.value=verticalSpeed>0?1:0;
    wakeMaterial.uniforms.flow.value.copy(trailDirection).negate();
    localFlow.copy(trailDirection).applyQuaternion(car.getWorldQuaternion(inverse).invert());
    material.uniforms.flowDirection.value.copy(localFlow);
    if(mesh){mesh.visible=heat>.005;material.uniforms.heat.value=heat;
      material.uniforms.time.value=time;material.uniforms.travelSign.value=verticalSpeed<0?-1:1;}
    carry+=heat>.02?dt*500:0;
    while(carry>=1){
      carry--;const p=particles[cursor];cursor=(cursor+1)%count;
      p.position.set(Math.sin(cursor*2.4)*1.12,.35+(cursor%11)/11,Math.cos(cursor*2.4)*2.1);car.localToWorld(p.position);
      // Start ascent flames below the chassis, not along the roof and windows.
      if(verticalSpeed>0) p.position.y=Math.min(p.position.y,car.position.y-.08);
      p.velocity.copy(trailDirection).multiplyScalar(-18);p.age=0;p.heat=heat;
    }
    particles.forEach((p,i)=>{
      p.age+=dt;
      // Follow reversals too: climbing trails down; descending trails up.
      if(velocity.lengthSq()>1) p.velocity.copy(trailDirection).multiplyScalar(-18);
      p.position.addScaledVector(p.velocity,dt);
      // Clear old descent gas above the car immediately when climbing begins.
      const alive=p.age<.5 && p.position.distanceToSquared(car.position)<225
        && (verticalSpeed<=0 || p.position.y<=car.position.y);
      positions.set([p.position.x,p.position.y,p.position.z],i*3);
      geometry.attributes.age.setX(i,Math.min(1,p.age/.5));
      fades[i]=alive?p.heat*Math.pow(1-p.age/.5,1.5)*.85:0;
    });
    geometry.attributes.center.needsUpdate=true;geometry.attributes.fade.needsUpdate=true;
    geometry.attributes.age.needsUpdate=true;
  },dispose(){scene.remove(wake);geometry.dispose();plane.dispose();wakeMaterial.dispose();
    if(mesh){car.remove(mesh);mesh.geometry.dispose();}material.dispose();}};
}
