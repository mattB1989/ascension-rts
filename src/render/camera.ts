// RTS camera: orbits a ground target at a fixed pitch. Pan, zoom, rotate.

import * as THREE from 'three';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Ground point the camera looks at (x, z). */
  readonly target = new THREE.Vector2();
  yaw = -2.356; // looking from player 1's base towards the enemy
  pitch = 0.95;
  distance = 42;
  readonly minDistance = 10;
  readonly maxDistance = 140;
  /** Pan velocity in world units per second (fling / inertia after a drag). */
  private readonly vel = new THREE.Vector2();
  private bounds: { w: number; h: number };

  constructor(aspect: number, mapW: number, mapH: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 600);
    this.bounds = { w: mapW, h: mapH };
  }

  /** Ground-plane basis vectors for the current yaw. */
  basis(): { right: THREE.Vector2; forward: THREE.Vector2 } {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    return { right: new THREE.Vector2(c, -s), forward: new THREE.Vector2(-s, -c) };
  }

  /** Pan by an amount in world units along the screen's right / forward directions. */
  pan(rightAmt: number, forwardAmt: number): void {
    const { right, forward } = this.basis();
    this.target.x += right.x * rightAmt + forward.x * forwardAmt;
    this.target.y += right.y * rightAmt + forward.y * forwardAmt;
    this.clamp();
  }

  /** Screen pixels -> world (right, forward) amounts at the current zoom. */
  pixelsToWorld(dx: number, dy: number, viewportHeight: number): [number, number] {
    const worldPerPixel = (2 * this.distance * Math.tan((this.camera.fov * Math.PI) / 360)) / viewportHeight;
    return [-dx * worldPerPixel, (dy * worldPerPixel) / Math.sin(this.pitch)];
  }

  /** Pan so that a screen drag of (dx, dy) pixels moves the ground under the finger. */
  panPixels(dx: number, dy: number, viewportHeight: number): void {
    const [r, f] = this.pixelsToWorld(dx, dy, viewportHeight);
    this.pan(r, f);
  }

  /** Keep gliding after a drag is released, at (right, forward) world units per second. */
  fling(rightPerSec: number, forwardPerSec: number): void {
    const { right, forward } = this.basis();
    this.vel.set(right.x * rightPerSec + forward.x * forwardPerSec, right.y * rightPerSec + forward.y * forwardPerSec);
    const max = this.distance * 5;
    if (this.vel.length() > max) this.vel.setLength(max);
  }

  stopFling(): void {
    this.vel.set(0, 0);
  }

  /** Per-frame: apply fling inertia with friction. */
  tick(dt: number): void {
    if (this.vel.lengthSq() < 0.25) {
      this.vel.set(0, 0);
      return;
    }
    this.target.x += this.vel.x * dt;
    this.target.y += this.vel.y * dt;
    this.clamp();
    this.vel.multiplyScalar(Math.exp(-4.5 * dt));
  }

  zoom(factor: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * factor));
  }

  /** Zoom keeping the ground point (x, z) fixed on screen (zoom towards the cursor). */
  zoomAt(factor: number, x: number, z: number): void {
    const before = this.distance;
    this.zoom(factor);
    const k = this.distance / before;
    this.target.set(x + (this.target.x - x) * k, z + (this.target.y - z) * k);
    this.clamp();
  }

  rotate(dYaw: number): void {
    this.yaw += dYaw;
  }

  lookAt(x: number, z: number): void {
    this.target.set(x, z);
    this.clamp();
  }

  private clamp(): void {
    this.target.x = Math.max(0, Math.min(this.bounds.w, this.target.x));
    this.target.y = Math.max(0, Math.min(this.bounds.h, this.target.y));
  }

  update(aspect: number): void {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cam = this.camera;
    cam.aspect = aspect;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      sp * this.distance,
      this.target.y + Math.cos(this.yaw) * cp * this.distance,
    );
    cam.lookAt(this.target.x, 0, this.target.y);
    cam.updateProjectionMatrix();
  }
}
