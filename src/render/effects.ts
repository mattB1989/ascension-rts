// Short-lived visual effects: move markers, muzzle flashes, tracers, projectiles
// in flight, explosions, smoke, wrecks. Everything is pooled per kind so long
// battles do not churn memory.

import * as THREE from 'three';
import type { WeaponDef } from '../data/weapons.ts';
import { surfaceHeight } from '../sim/map.ts';
import { DT } from '../sim/time.ts';
import type { GameEvent, Projectile, World } from '../sim/world.ts';

interface Fx {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update: (fx: Fx, k: number, dt: number) => void;
  done?: () => void;
}

const GEO = {
  ring: new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2),
  ball: new THREE.SphereGeometry(1, 10, 8),
  smallBall: new THREE.SphereGeometry(1, 6, 4),
  shell: new THREE.SphereGeometry(0.09, 6, 4),
  missile: new THREE.ConeGeometry(0.06, 0.38, 6).rotateX(Math.PI / 2),
  scorch: new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
  column: new THREE.CylinderGeometry(0.25, 0.45, 1, 8, 1, true).translate(0, 0.5, 0),
};

const fireMat = () => new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
const smokeMat = () => new THREE.MeshBasicMaterial({ color: 0x3b3b3b, transparent: true, opacity: 0.6, depthWrite: false });

export class Effects {
  readonly group = new THREE.Group();
  private readonly fx: Fx[] = [];
  private readonly projectiles = new Map<number, THREE.Object3D>();
  private readonly tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.9 });
  private readonly shellMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  private readonly missileMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  private readonly torpedoMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.6 });
  private world: World | null = null;
  /** Only effects the viewer can see are drawn (fog of war). */
  viewer = -1;

  private seen(x: number, y: number): boolean {
    const w = this.world;
    if (!w || this.viewer < 0) return true;
    const p = w.players[this.viewer];
    if (!p) return true;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= w.map.width || ty >= w.map.height) return false;
    return p.visible[ty * w.map.width + tx] === 1;
  }

  /** Ground or sea height at a point. */
  private base(x: number, y: number): number {
    return this.world ? Math.max(0, surfaceHeight(this.world.map, x, y)) : 0;
  }

  private add(obj: THREE.Object3D, life: number, update: Fx['update'], done?: () => void): void {
    this.group.add(obj);
    this.fx.push({ obj, age: 0, life, update, done });
  }

  moveMarker(x: number, y: number, z: number): void {
    const m = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 1, depthWrite: false });
    const mesh = new THREE.Mesh(GEO.ring, m);
    mesh.position.set(x, y + 0.08, z);
    mesh.renderOrder = 3;
    this.add(mesh, 0.7, (f, k) => {
      const s = 1.6 - k * 1.1;
      f.obj.scale.set(s, 1, s);
      m.opacity = 1 - k;
    }, () => m.dispose());
  }

  attackMarker(x: number, y: number, z: number): void {
    const m = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 1, depthWrite: false });
    const mesh = new THREE.Mesh(GEO.ring, m);
    mesh.position.set(x, y + 0.1, z);
    mesh.renderOrder = 3;
    this.add(mesh, 0.7, (f, k) => {
      const s = 1.5 - k * 0.9;
      f.obj.scale.set(s, 1, s);
      m.opacity = 1 - k;
    }, () => m.dispose());
  }

  private flash(x: number, y: number, z: number, size: number, color = 0xffd27a): void {
    const m = fireMat();
    m.color.setHex(color);
    const mesh = new THREE.Mesh(GEO.smallBall, m);
    mesh.position.set(x, z, y);
    mesh.scale.setScalar(size);
    this.add(mesh, 0.09, (_f, k) => (m.opacity = 1 - k), () => m.dispose());
  }

  private tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, az, ay), new THREE.Vector3(bx, bz, by)]);
    const m = this.tracerMat.clone();
    const line = new THREE.Line(g, m);
    this.add(line, 0.08, (_f, k) => (m.opacity = 0.9 * (1 - k)), () => {
      g.dispose();
      m.dispose();
    });
  }

  /** Fireball with a smoke puff. `size` in tiles. */
  explosion(x: number, y: number, z: number, size: number, opts: { smoke?: number; color?: number } = {}): void {
    const fm = fireMat();
    if (opts.color) fm.color.setHex(opts.color);
    const fire = new THREE.Mesh(GEO.ball, fm);
    fire.position.set(x, z, y);
    this.add(fire, 0.45, (f, k) => {
      f.obj.scale.setScalar(size * (0.3 + k * 0.9));
      fm.opacity = 1 - k;
      fm.color.lerp(new THREE.Color(0xff5a1a), 0.08);
    }, () => fm.dispose());
    const n = opts.smoke ?? (size > 0.6 ? 3 : 1);
    for (let i = 0; i < n; i++) {
      const sm = smokeMat();
      const puff = new THREE.Mesh(GEO.ball, sm);
      const ox = (Math.random() - 0.5) * size;
      const oz = (Math.random() - 0.5) * size;
      puff.position.set(x + ox, z, y + oz);
      const rise = 0.6 + Math.random() * 0.8;
      this.add(puff, 1.6 + Math.random(), (f, k, dt) => {
        f.obj.position.y += rise * dt;
        f.obj.scale.setScalar(size * (0.4 + k * 0.9));
        sm.opacity = 0.55 * (1 - k);
      }, () => sm.dispose());
    }
  }

  private splash(x: number, y: number, size: number): void {
    const m = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.85, depthWrite: false });
    const col = new THREE.Mesh(GEO.column, m);
    col.position.set(x, 0, y);
    this.add(col, 0.7, (f, k) => {
      f.obj.scale.set(size * (1 + k), size * 2.2 * Math.sin(Math.PI * Math.min(1, k * 1.3)), size * (1 + k));
      m.opacity = 0.85 * (1 - k);
    }, () => m.dispose());
  }

  /** Scorch mark and a smoke column that lingers where something was destroyed. */
  private wreck(x: number, y: number, size: number, smokeFor: number): void {
    const m = new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.7, depthWrite: false });
    const s = new THREE.Mesh(GEO.scorch, m);
    s.position.set(x, this.base(x, y) + 0.05, y);
    s.scale.setScalar(size * 1.2);
    s.renderOrder = 1;
    this.add(s, 30, (_f, k) => (m.opacity = 0.7 * (1 - k * k)), () => m.dispose());
    const end = smokeFor;
    let t = 0;
    let next = 0;
    const holder = new THREE.Object3D();
    this.add(holder, end, (_f, _k, dt) => {
      t += dt;
      if (t < next) return;
      next = t + 0.35;
      const sm = smokeMat();
      const puff = new THREE.Mesh(GEO.ball, sm);
      puff.position.set(x + (Math.random() - 0.5) * size * 0.6, this.base(x, y) + 0.3, y + (Math.random() - 0.5) * size * 0.6);
      this.add(puff, 3, (f, k, dt2) => {
        f.obj.position.y += 0.9 * dt2;
        f.obj.scale.setScalar(size * 0.35 * (0.5 + k * 1.5));
        sm.opacity = 0.5 * (1 - k);
      }, () => sm.dispose());
    });
  }

  handleEvents(events: readonly GameEvent[], world: World): void {
    this.world = world;
    let shots = 0;
    for (const e of events) {
      if ((e.kind === 'shot' || e.kind === 'impact' || e.kind === 'died') && !this.seen(e.x, e.y)) continue;
      if (e.kind === 'shot') {
        if (++shots > 80) continue; // cap per frame in huge battles
        const bz = this.base(e.x, e.y) + e.z;
        const tz = this.base(e.tx, e.ty) + e.tz;
        this.flash(e.x, e.y, bz, e.weapon.type === 'bullet' ? 0.12 : 0.22);
        if (e.weapon.projectile === 'instant') this.tracer(e.x, e.y, bz, e.tx, e.ty, tz);
      } else if (e.kind === 'impact') {
        this.impact(e.x, e.y, this.base(e.x, e.y) + e.z, e.weapon);
      } else if (e.kind === 'died') {
        const z = this.base(e.x, e.y);
        if (e.entity === 'building') {
          this.explosion(e.x, e.y, z + 0.8, e.size * 0.7, { smoke: 6 });
          this.wreck(e.x, e.y, e.size, 8);
        } else if (e.air) {
          this.explosion(e.x, e.y, z + 4, 1.2, { smoke: 2 });
          this.wreck(e.x, e.y, 0.8, 3);
        } else if (e.size < 0.4) {
          this.explosion(e.x, e.y, z + 0.3, 0.35, { smoke: 1, color: 0xc8b090 });
        } else {
          this.explosion(e.x, e.y, z + 0.5, e.size * 1.6, { smoke: 3 });
          this.wreck(e.x, e.y, e.size * 1.3, 4);
        }
      }
    }
  }

  private impact(x: number, y: number, z: number, w: WeaponDef): void {
    const onWater = this.world ? surfaceHeight(this.world.map, x, y) < 0 && z < 0.5 : false;
    if (w.type === 'torpedo' || (onWater && w.projectile === 'shell')) {
      this.splash(x, y, w.splash ? 0.6 : 0.4);
      return;
    }
    if (w.type === 'bullet') {
      if (Math.random() < 0.5) this.flash(x, y, z, 0.08, 0xfff1a0);
      return;
    }
    if (w.type === 'aa') {
      this.explosion(x, y, z, 0.5, { smoke: 1, color: 0xffe08a });
      return;
    }
    const size = w.splash ? w.splash * 0.9 : w.type === 'explosive' ? 0.8 : 0.45;
    this.explosion(x, y, z, size, { smoke: w.splash ? 2 : 1 });
  }

  /** Projectiles in flight: shells arc, missiles and torpedoes fly straight. */
  private syncProjectiles(world: World, alpha: number): void {
    const seen = new Set<number>();
    for (const p of world.projectiles) {
      seen.add(p.id);
      let obj = this.projectiles.get(p.id);
      if (!obj) {
        obj = this.makeProjectile(p);
        this.projectiles.set(p.id, obj);
        this.group.add(obj);
      }
      this.placeProjectile(obj, p, alpha);
      obj.visible = this.seen(p.x, p.y);
    }
    for (const [id, obj] of this.projectiles) {
      if (seen.has(id)) continue;
      this.group.remove(obj);
      this.projectiles.delete(id);
    }
  }

  private makeProjectile(p: Projectile): THREE.Object3D {
    const w = p.weapon;
    if (w.projectile === 'shell') return new THREE.Mesh(GEO.shell, this.shellMat);
    if (w.projectile === 'torpedo') {
      const m = new THREE.Mesh(GEO.missile, this.torpedoMat);
      m.scale.set(1.5, 1, 2);
      return m;
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(GEO.missile, this.missileMat));
    const glow = new THREE.Mesh(GEO.smallBall, fireMat());
    glow.scale.setScalar(0.07);
    glow.position.z = -0.22;
    g.add(glow);
    return g;
  }

  private placeProjectile(obj: THREE.Object3D, p: Projectile, alpha: number): void {
    const w = p.weapon;
    if (w.projectile === 'shell') {
      const k = Math.min(1, (p.t + alpha * DT) / p.dur);
      const x = p.sx + (p.tx - p.sx) * k;
      const y = p.sy + (p.ty - p.sy) * k;
      const d = Math.hypot(p.tx - p.sx, p.ty - p.sy);
      // Lobbed shots (artillery, depth charges) arc high; tank shells fly flat.
      const arc = (w.minRange ? 0.25 : 0.04) * d;
      const z = this.base(p.sx, p.sy) + p.sz + (this.base(x, y) - this.base(p.sx, p.sy) - p.sz + 0.3) * k + Math.sin(Math.PI * k) * arc;
      obj.position.set(x, z, y);
      return;
    }
    const z = w.projectile === 'torpedo' ? -0.15 : this.base(p.x, p.y) + Math.max(p.sz * 0.6, 0.6);
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    obj.position.set(p.x, z, p.y);
    obj.rotation.set(0, -ang + Math.PI / 2, 0);
    if (w.projectile === 'missile' && Math.random() < 0.35 && this.seen(p.x, p.y)) {
      const sm = smokeMat();
      sm.color.setHex(0xd8d8d8);
      const puff = new THREE.Mesh(GEO.smallBall, sm);
      puff.position.copy(obj.position);
      this.add(puff, 0.6, (f, k) => {
        f.obj.scale.setScalar(0.06 + k * 0.18);
        sm.opacity = 0.5 * (1 - k);
      }, () => sm.dispose());
    }
  }

  update(dt: number, world?: World, alpha = 1): void {
    if (world) {
      this.world = world;
      this.syncProjectiles(world, alpha);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      f.update(f, k, dt);
      if (f.age >= f.life) {
        this.group.remove(f.obj);
        f.done?.();
        this.fx.splice(i, 1);
      }
    }
  }
}
