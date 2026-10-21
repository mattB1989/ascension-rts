// Fog of war on the GPU: a small texture (one texel per tile) holds visible /
// explored / unexplored, and every material darkens itself by sampling it at
// its world position. One shared uniform set; patched into standard materials
// with onBeforeCompile so lighting, shadows and instancing keep working.

import * as THREE from 'three';
import type { World } from '../sim/world.ts';

const VISIBLE = 255;
const EXPLORED = 118;

let texture: THREE.DataTexture | null = null;
let data: Uint8Array | null = null;
let enabled = true;

export const fowUniforms = {
  uFow: { value: null as THREE.DataTexture | null },
  uFowSize: { value: new THREE.Vector2(1, 1) },
  uFowOn: { value: 1 },
};

export function initFog(width: number, height: number, on: boolean): void {
  data = new Uint8Array(width * height * 4);
  texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  fowUniforms.uFow.value = texture;
  fowUniforms.uFowSize.value.set(width, height);
  fowUniforms.uFowOn.value = on ? 1 : 0;
  enabled = on;
}

/** Copy the player's fog state into the texture. */
export function updateFogTexture(world: World, player: number): void {
  if (!texture || !data) return;
  const p = world.players[player]!;
  const n = world.map.width * world.map.height;
  for (let i = 0; i < n; i++) {
    data[i * 4] = enabled ? (p.visible[i] ? VISIBLE : p.explored[i] ? EXPLORED : 0) : VISIBLE;
  }
  texture.needsUpdate = true;
}

/** GLSL: brightness for a world xz position (1 = visible, ~0.5 explored, ~0 unexplored). */
export const FOW_GLSL = /* glsl */ `
  uniform sampler2D uFow;
  uniform vec2 uFowSize;
  uniform float uFowOn;
  float fowLight(vec2 xz) {
    if (uFowOn < 0.5) return 1.0;
    vec2 uv = xz / uFowSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.05;
    float f = texture2D(uFow, uv).r;
    return 0.04 + 0.96 * f;
  }
  vec3 fowApply(vec3 c, vec2 xz) {
    float l = fowLight(xz);
    // Explored-but-not-visible areas are dimmed and slightly desaturated.
    float grey = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 desat = mix(vec3(grey), c, smoothstep(0.45, 0.95, l));
    return desat * l;
  }
`;

const patched = new WeakSet<THREE.Material>();

/** Make a standard (lit) material respect the fog of war. */
export function applyFow(material: THREE.Material): void {
  if (patched.has(material)) return;
  patched.add(material);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uFow = fowUniforms.uFow;
    shader.uniforms.uFowSize = fowUniforms.uFowSize;
    shader.uniforms.uFowOn = fowUniforms.uFowOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFowXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fowWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fowWorld = instanceMatrix * fowWorld;
        #endif
        fowWorld = modelMatrix * fowWorld;
        vFowXZ = fowWorld.xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFowXZ;\n${FOW_GLSL}`)
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = fowApply(gl_FragColor.rgb, vFowXZ);\n#include <tonemapping_fragment>');
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + '|fow';
  material.needsUpdate = true;
}

/** Patch every material under an object. */
export function applyFowTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) applyFow(mat);
    }
  });
}
