// Owns the three.js scene: lights, terrain, water, units, effects, camera.

import * as THREE from 'three';
import type { World } from '../sim/world.ts';
import { CameraRig } from './camera.ts';
import { Effects } from './effects.ts';
import { BuildingsView } from './buildingsView.ts';
import { applyFowTree, initFog, updateFogTexture } from './fog.ts';
import { PlacementGhost } from './ghost.ts';
import { ResourcesView } from './resourcesView.ts';
import { TerrainView } from './terrain.ts';
import { UnitsView } from './unitsView.ts';
import { Water } from './water.ts';

const SKY = 0x9cc4e4;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly terrain: TerrainView;
  readonly units: UnitsView;
  readonly buildings: BuildingsView;
  readonly resources: ResourcesView;
  readonly ghost: PlacementGhost;
  readonly effects = new Effects();
  /** Whose eyes we see the world through (fog of war). */
  viewer: number;
  private lastFogTick = -1;
  private readonly water: Water;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunDir = new THREE.Vector3(-0.45, 0.8, -0.35).normalize();
  private readonly canvas: HTMLCanvasElement;
  private readonly world: World;
  private readonly raycaster = new THREE.Raycaster();
  private readonly lowPower: boolean;

  constructor(canvas: HTMLCanvasElement, world: World, viewer: number, fogOn = true) {
    this.canvas = canvas;
    this.world = world;
    this.viewer = viewer;
    const map = world.map;
    initFog(map.width, map.height, fogOn);
    this.lowPower = matchMedia('(pointer: coarse)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 80, 250);

    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x55603f, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = true;
    const size = this.lowPower ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.terrain = new TerrainView(map);
    applyFowTree(this.terrain.group);
    this.scene.add(this.terrain.group);
    this.water = new Water(map, this.sunDir);
    this.scene.add(this.water.mesh);
    this.resources = new ResourcesView(world);
    this.scene.add(this.resources.group);
    this.buildings = new BuildingsView(world);
    this.buildings.onCreate = (b) => this.terrain.clearTrees(b.tx, b.ty, b.w, b.h);
    this.units = new UnitsView(world);
    this.ghost = new PlacementGhost(map);
    this.scene.add(this.buildings.group, this.units.group, this.effects.group, this.ghost.group);

    this.rig = new CameraRig(1, map.width, map.height);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.rig.update(w / h);
  }

  get viewportHeight(): number {
    return this.canvas.clientHeight || window.innerHeight;
  }

  render(alpha: number, time: number, frameDt: number, selected: ReadonlySet<number>): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.rig.update(w / h);
    const t = this.rig.target;
    // Shadows follow the camera; snap to texel steps to avoid shimmering.
    const step = 90 / this.sun.shadow.mapSize.x;
    const tx = Math.round(t.x / step) * step;
    const tz = Math.round(t.y / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 90, this.sunDir.y * 90, tz + this.sunDir.z * 90);
    const extent = Math.min(80, 20 + this.rig.distance * 0.75);
    const sc = this.sun.shadow.camera;
    if (sc.right !== extent) {
      sc.left = -extent;
      sc.right = extent;
      sc.top = extent;
      sc.bottom = -extent;
      sc.updateProjectionMatrix();
    }
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.rig.distance * 1.6;
    fog.far = this.rig.distance * 4.5 + 60;

    if (this.world.tick !== this.lastFogTick) {
      this.lastFogTick = this.world.tick;
      updateFogTexture(this.world, this.viewer);
    }
    this.water.update(time);
    this.resources.update();
    this.buildings.update(time, frameDt, selected, this.viewer);
    this.units.update(alpha, time, frameDt, selected, this.viewer);
    this.effects.update(frameDt);
    this.renderer.render(this.scene, this.rig.camera);
  }

  /** Ground (or water surface) point under a screen position, in world coords (x, y = map y). */
  pickGround(clientX: number, clientY: number): { x: number; y: number; h: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.terrain.pickables, true);
    const ray = this.raycaster.ray;
    let point: THREE.Vector3 | null = hits[0]?.point.clone() ?? null;
    if (!point || point.y < 0) {
      // Under water (or off the terrain): use the water surface instead.
      if (Math.abs(ray.direction.y) < 1e-6) return null;
      const t = -ray.origin.y / ray.direction.y;
      if (t < 0) return null;
      point = ray.origin.clone().addScaledVector(ray.direction, t);
    }
    const m = this.world.map;
    if (point.x < 0 || point.z < 0 || point.x > m.width || point.z > m.height) return null;
    return { x: point.x, y: point.z, h: point.y };
  }

  /** Screen position (CSS pixels relative to the canvas) of a world point. */
  toScreen(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.rig.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((p.x + 1) / 2) * rect.width,
      y: ((1 - p.y) / 2) * rect.height,
      visible: p.z < 1 && p.x >= -1.1 && p.x <= 1.1 && p.y >= -1.1 && p.y <= 1.1,
    };
  }

  /** Ground footprint of the view (4 corners), for the minimap. */
  viewFootprint(): Array<{ x: number; y: number }> {
    const cam = this.rig.camera;
    const out: Array<{ x: number; y: number }> = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), cam);
      const r = this.raycaster.ray;
      let t = r.direction.y < -1e-3 ? -r.origin.y / r.direction.y : 400;
      t = Math.min(t, 400);
      const p = r.origin.clone().addScaledVector(r.direction, t);
      out.push({ x: p.x, y: p.z });
    }
    return out;
  }
}
