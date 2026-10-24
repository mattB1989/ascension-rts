// Model gallery (?mode=models): every building of the economy game on a grid, in
// the game's lighting, to review the models side by side. Options:
//   &only=house,farm      just these types (comma-separated)
//   &levels=1             every house level (cottage to spire)
//   &cols=6               grid width
//   &night=1              night lighting (lit windows)
//   &angle=45             camera yaw in degrees; &dist=… camera distance

import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.ts';
import { CITY_PALETTE, HOUSE_LEVELS } from '../data/city.ts';
import { buildCityModel } from './cityModels.ts';
import { kitUniforms } from './kit.ts';
import { windowMaterial } from './cityModels.ts';
import { initFog, initOverlay } from './fog.ts';

export function showGallery(_root: HTMLElement, params: URLSearchParams): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  initFog(4, 4, false);
  initOverlay(4, 4);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const night = params.get('night') === '1';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? 0x141d33 : 0x9cc4e4);
  scene.add(new THREE.HemisphereLight(night ? 0x6a7fb8 : 0xdcefff, 0x55603f, night ? 0.65 : 1.5));
  const sun = new THREE.DirectionalLight(night ? 0x8ea6ff : 0xfff1d6, night ? 0.75 : 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  if (night) {
    kitUniforms.uGlow.value = 3;
    windowMaterial().emissiveIntensity = 4.6;
  }

  const only = params.get('only')?.split(',').filter(Boolean);
  const types: Array<{ type: string; level: number; label: string }> = [];
  const all = CITY_PALETTE.flatMap((t) => t.items).filter((t) => t !== 'road' && t !== 'rail' && t !== 'maglev' && t !== 'pipe' && BUILDINGS[t as keyof typeof BUILDINGS]);
  for (const t of ['town_hall', ...all]) {
    if (only && !only.includes(t)) continue;
    if (types.some((x) => x.type === t)) continue;
    if (t === 'house' && (params.get('levels') === '1' || only?.includes('house'))) {
      HOUSE_LEVELS.forEach((l, i) => types.push({ type: t, level: i, label: l.name }));
    } else types.push({ type: t, level: 0, label: BUILDINGS[t as keyof typeof BUILDINGS]?.name ?? t });
  }

  const cols = Number(params.get('cols') ?? Math.ceil(Math.sqrt(types.length * 1.6)));
  const cell = 7;
  const rows = Math.ceil(types.length / cols);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(cols * cell + 10, rows * cell + 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7fa04a, roughness: 1 }));
  ground.receiveShadow = true;
  ground.position.set(((cols - 1) * cell) / 2, -0.01, ((rows - 1) * cell) / 2);
  scene.add(ground);
  const labels: Array<{ el: HTMLElement; at: THREE.Vector3 }> = [];
  types.forEach((t, i) => {
    const cx = (i % cols) * cell;
    const cz = Math.floor(i / cols) * cell;
    const model = buildCityModel(t.type, 0x2f6fd0, t.level, i * 7 + 3);
    const def = BUILDINGS[t.type as keyof typeof BUILDINGS];
    const [w, h] = def?.size ?? [2, 2];
    const pad = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, h), new THREE.MeshStandardMaterial({ color: 0x6f6d66, roughness: 1 }));
    pad.position.set(cx, 0.0, cz);
    pad.receiveShadow = true;
    scene.add(pad);
    if (model) {
      model.position.set(cx, 0, cz);
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(model);
    }
    const el = document.createElement('div');
    el.textContent = t.label;
    el.style.cssText = 'position:fixed;z-index:10;transform:translate(-50%,0);font:12px system-ui;color:#fff;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:4px;pointer-events:none;white-space:nowrap';
    document.body.appendChild(el);
    labels.push({ el, at: new THREE.Vector3(cx, 0, cz + h / 2 + 0.4) });
  });

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
  const center = new THREE.Vector3(((cols - 1) * cell) / 2, 0, ((rows - 1) * cell) / 2);
  const yaw = (Number(params.get('angle') ?? 35) * Math.PI) / 180;
  const dist = Number(params.get('dist') ?? Math.max(cols * cell * 0.8, rows * cell * 1.25) + 6);
  const place = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.position.set(center.x + Math.sin(yaw) * dist * 0.62, dist * 0.78, center.z + Math.cos(yaw) * dist * 0.62);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    const ext = Math.max(cols, rows) * cell * 0.75;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -ext;
    sc.right = sc.top = ext;
    sc.far = 400;
    sc.updateProjectionMatrix();
    sun.target.position.copy(center);
    sun.position.set(center.x - 0.45 * 120, 0.8 * 120, center.z - 0.35 * 120);
    for (const l of labels) {
      const p = l.at.clone().project(camera);
      l.el.style.left = `${((p.x + 1) / 2) * w}px`;
      l.el.style.top = `${((1 - p.y) / 2) * h}px`;
    }
  };
  place();
  window.addEventListener('resize', place);
  (window as unknown as { galleryReady: boolean }).galleryReady = false;
  const frame = () => {
    renderer.render(scene, camera);
    (window as unknown as { galleryReady: boolean }).galleryReady = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
