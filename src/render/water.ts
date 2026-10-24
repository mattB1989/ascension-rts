// Animated water surface. Colour, transparency and shoreline foam come from a
// depth texture baked from the map, so no render-to-texture pass is needed
// (cheap enough for phones).

import * as THREE from 'three';
import type { GameMap } from '../sim/map.ts';
import { FOW_GLSL, fowUniforms } from './fog.ts';

const vertex = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uLight;
  uniform sampler2D uDepth;
  uniform vec2 uMapSize;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${FOW_GLSL}

  float waveHeight(vec2 p, float t) {
    return sin(p.x * 0.9 + t * 1.3) * 0.5
         + sin(p.y * 1.1 - t * 1.1) * 0.5
         + sin((p.x + p.y) * 0.55 + t * 0.7) * 0.6
         + sin((p.x - p.y) * 2.3 + t * 2.1) * 0.15;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 uv = (p + 0.5) / (uMapSize + 1.0);
    float depth = 1.0;
    if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) depth = texture2D(uDepth, uv).r;

    float e = 0.05;
    float h0 = waveHeight(p, uTime);
    float hx = waveHeight(p + vec2(e, 0.0), uTime);
    float hz = waveHeight(p + vec2(0.0, e), uTime);
    vec3 n = normalize(vec3(-(hx - h0) / e * 0.06, 1.0, -(hz - h0) / e * 0.06));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 90.0);

    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.55, depth));
    col = mix(col, uSky, fres * 0.45);
    col += spec * 0.7;

    // Shoreline foam that laps in and out.
    float foamBand = smoothstep(0.09, 0.0, depth);
    float ripple = 0.5 + 0.5 * sin(uTime * 1.8 - depth * 60.0 + h0);
    float foam = foamBand * (0.45 + 0.55 * ripple);
    col = mix(col, vec3(0.93, 0.96, 0.97), foam * 0.75);

    float alpha = mix(0.5, 0.93, smoothstep(0.0, 0.35, depth));
    alpha = max(alpha, foam * 0.9);
    col *= uLight;
    col = fowApply(col, p);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(map: GameMap, sunDir: THREE.Vector3) {
    const w = map.width;
    const h = map.height;
    // Depth texture: 0 at the shoreline, 1 at 3 tiles deep or more.
    const tw = w + 1;
    const th = h + 1;
    const data = new Uint8Array(tw * th * 4);
    for (let i = 0; i < tw * th; i++) {
      const d = Math.max(0, Math.min(1, -map.velev[i]! / 3));
      data[i * 4] = Math.round(d * 255);
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, tw, th, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = false;
    tex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSunDir: { value: sunDir.clone().normalize() },
          uShallow: { value: new THREE.Color(0x3fb6b0) },
          uDeep: { value: new THREE.Color(0x0f3d5c) },
          uSky: { value: new THREE.Color(0xa9cde8) },
          uLight: { value: new THREE.Color(1, 1, 1) },
          uDepth: { value: tex },
          uMapSize: { value: new THREE.Vector2(w, h) },
        },
      ]),
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      fog: true,
      depthWrite: false,
    });
    // UniformsUtils.merge clones textures; point back at the originals / shared fog uniforms.
    this.material.uniforms.uDepth!.value = tex;
    this.material.uniforms.uFow = fowUniforms.uFow;
    this.material.uniforms.uFowSize = fowUniforms.uFowSize;
    this.material.uniforms.uFowOn = fowUniforms.uFowOn;

    const geo = new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(w / 2, 0, h / 2);
    this.mesh.renderOrder = 1;
  }

  update(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }

  /** Day and night: how much light falls on the water (1 = full day), and the sky it reflects. */
  setLight(light: THREE.Color, sky: THREE.Color): void {
    (this.material.uniforms.uLight!.value as THREE.Color).copy(light);
    (this.material.uniforms.uSky!.value as THREE.Color).copy(sky).lerp(new THREE.Color(0xa9cde8), 0.3);
  }
}
