// Deterministic trigonometry for the simulation.
// Math.sin/cos/atan2 can differ in the last bits between browsers, which would
// desynchronise replays and multiplayer. These use only + - * / so they are
// bit-identical everywhere. Accuracy is ~1e-7, plenty for gameplay.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  return a - TAU * Math.floor((a + PI) / TAU);
}

export function fsin(x: number): number {
  x = wrapAngle(x);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - (x2 / 110) * (1 - x2 / 156))))));
}

export function fcos(x: number): number {
  return fsin(x + HALF_PI);
}

/** atan for |z| <= 1, polynomial approximation. */
function fatanUnit(z: number): number {
  const z2 = z * z;
  return z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.0117212)))));
}

export function fatan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let r = ax >= ay ? fatanUnit(ay / ax) : HALF_PI - fatanUnit(ax / ay);
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}
