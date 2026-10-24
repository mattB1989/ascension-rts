// Animated water surface. Colour, transparency and shoreline foam come from a
// depth texture baked from the map, so no render-to-texture pass is needed
// (cheap enough for phones). Ripples are two scrolling layers of a tileable
// procedural normal map over a slow swell; the sky is reflected with Fresnel.

import * as THREE from 'three';
import type { GameMap } from '../sim/map.ts';
import { FOW_GLSL, fowUniforms } from './fog.ts';
import { waterTexture } from './textures.ts';

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
  uniform vec3 uMid;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uLight;
  uniform sampler2D uDepth;
  uniform sampler2D uRipple;
  uniform vec2 uMapSize;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${FOW_GLSL}

  // Ripple normal from the tileable map: x, y in the water plane, z up.
  vec2 ripple(vec2 uv) {
    return texture2D(uRipple, uv).rg * 2.0 - 1.0;
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 uv = (p + 0.5) / (uMapSize + 1.0);
    float depth = 1.0;
    if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) depth = texture2D(uDepth, uv).r;
    float t = uTime;
    vec3 toEye = cameraPosition - vWorld;
    float dist = length(toEye);
    vec3 V = toEye / dist;

    // Two ripple layers drifting across each other, and a slow broad swell under them.
    vec2 s1 = ripple(p * 0.16 + vec2(t * 0.022, t * 0.012));
    vec2 s2 = ripple(p * 0.37 + vec2(-t * 0.031, t * 0.021) + 0.37);
    vec2 s3 = ripple(p * 0.05 + vec2(t * 0.007, -t * 0.01) + 0.71);
    // Calmer in the shallows, and flattened with distance so it does not shimmer.
    float calm = mix(0.6, 1.0, smoothstep(0.0, 0.35, depth));
    float fade = 1.0 - 0.65 * smoothstep(20.0, 140.0, dist);
    vec2 slope = (s1 * 0.5 + s2 * 0.32 + s3 * 0.45) * calm * fade;
    vec3 n = normalize(vec3(slope.x, 1.0, slope.y));

    // Water colour by depth: clear turquoise shallows, teal, then deep blue.
    vec3 body = mix(uShallow, uMid, smoothstep(0.0, 0.3, depth));
    body = mix(body, uDeep, smoothstep(0.25, 1.0, depth));
    // Light scattered through crests that face the sun.
    body *= 0.86 + 0.3 * clamp(dot(n, uSunDir), 0.0, 1.0);

    // Sky reflection (Fresnel): a gradient from a bright horizon to a deeper zenith, with soft clouds.
    float ndv = clamp(dot(n, V), 0.0, 1.0);
    float fres = 0.05 + 0.95 * pow(1.0 - ndv, 4.0);
    fres = clamp(fres * 1.35 + 0.05, 0.0, 0.9);
    vec3 R = reflect(-V, n);
    float up = clamp(R.y, 0.0, 1.0);
    vec3 horizon = mix(uSky, vec3(1.0), 0.3);
    vec3 zenith = uSky * vec3(0.62, 0.78, 1.0);
    vec3 sky = mix(horizon, zenith, sqrt(up));
    float cloud = texture2D(uRipple, R.xz / max(R.y, 0.2) * 0.05 + vec2(t * 0.002, t * 0.001)).a;
    sky = mix(sky, horizon * 1.05, smoothstep(0.45, 0.85, cloud) * 0.45);
    vec3 col = mix(body, sky, fres);

    // Sun glints: a tight highlight on the ripples and a broad sheen.
    vec3 H = normalize(uSunDir + V);
    float nh = max(dot(n, H), 0.0);
    col += vec3(1.0, 0.96, 0.88) * (pow(nh, 260.0) * 2.4 + pow(nh, 36.0) * 0.12);

    // Shoreline foam: a broken band that laps in and out, and faint crests rolling in.
    float pat = texture2D(uRipple, p * 0.42 + vec2(t * 0.012, -t * 0.008)).a * 0.6
              + texture2D(uRipple, p * 0.77 - vec2(t * 0.015, t * 0.007) + 0.5).a * 0.5;
    pat = clamp(pat - 0.1, 0.0, 1.0);
    float lap = 0.5 + 0.5 * sin(t * 1.6 - depth * 55.0 + s3.x * 3.0);
    float band = smoothstep(0.075, 0.0, depth) * (0.3 + 0.5 * lap);
    float crest = smoothstep(0.32, 0.1, depth) * smoothstep(0.1, 0.16, depth) * smoothstep(0.8, 1.0, 0.5 + 0.5 * sin(t * 0.9 - depth * 32.0 + s3.y * 2.0)) * 0.4;
    float amt = clamp(band + crest, 0.0, 1.0);
    float foam = smoothstep(1.0 - amt, 1.0 - amt + 0.25, pat) * (0.5 + 0.5 * amt) * step(0.001, amt);
    col = mix(col, vec3(0.94, 0.97, 0.98), foam * 0.8);

    float alpha = mix(0.42, 0.94, smoothstep(0.0, 0.4, depth));
    alpha = max(alpha, fres);
    alpha = max(alpha, foam * 0.92);
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
          uShallow: { value: new THREE.Color(0x4fc4b4) },
          uMid: { value: new THREE.Color(0x1f8a98) },
          uDeep: { value: new THREE.Color(0x0e3b5a) },
          uSky: { value: new THREE.Color(0xa9cde8) },
          uLight: { value: new THREE.Color(1, 1, 1) },
          uDepth: { value: tex },
          uRipple: { value: null },
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
    this.material.uniforms.uRipple!.value = waterTexture();
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
