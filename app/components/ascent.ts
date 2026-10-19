import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as THREE from "three";

// Fast ascent smears the passing world while leaving the car and dashboard readable.
export function ascentBlur(altitude: number, speed: number, climbing: boolean) {
  if (!climbing) return 0;
  const smooth = (a: number, b: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return .45 * smooth(250, 2400, Math.abs(speed)) * smooth(400, 5000, altitude)
    * (1 - smooth(120000, 220000, altitude));
}

// Entry flames signal fast descent on every world; Moon flames are a gameplay effect.
export function flightHeat(altitude: number, speed: number, planet: string) {
  // Fade flames before touchdown and in deep space, without a sudden altitude cut-off.
  if (speed < 0) {
    const nearGround = THREE.MathUtils.smoothstep(altitude, 100, 1200);
    const nearPlanet = 1 - THREE.MathUtils.smoothstep(altitude, 180000, 240000);
    const entrySpeed = THREE.MathUtils.smoothstep(-speed, 250, 1800);
    return .95 * nearGround * nearPlanet * entrySpeed;
  }
  if (planet === "moon" || altitude > 110000 || altitude < 300) return 0;
  const density = Math.exp(-altitude / (planet === "mars" ? 22000 : 26000));
  return Math.min(.65, Math.max(0, (Math.abs(speed)-200)/900) * Math.sqrt(density)) * (planet === "mars" ? .45 : 1);
}

// Blur only the rendered scene: no painted speed lines or artificial star streaks.
export function makeAscentPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 },  time: { value: 0 },
      center: { value: new THREE.Vector2(.5, .5) }, aspect: { value: 1 } },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float strength,aspect,time;
      uniform vec2 center; varying vec2 vUv;
      void main(){
        // A short vertical shutter preserves a straight horizon during ascent.
        vec2 streak=vec2(0.,.006)*strength;
        vec4 color=vec4(0.);
        // Jittered shutter samples avoid a dotted trail around small bright lights.
        float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
        for(int i=0;i<32;i++){
          float shutter=(float(i)+jitter)/32.-.5;
          vec4 sampleColor=texture2D(tDiffuse,clamp(vUv+streak*shutter,vec2(.001),vec2(.999)));
          color+=vec4(min(sampleColor.rgb,vec3(2.5)),sampleColor.a);
        }
        color/=32.;
        gl_FragColor=color;
      }`,
  });
}
