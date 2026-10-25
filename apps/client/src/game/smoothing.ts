// Network state arrives at TICK_RATE; renderers ease toward it every frame so motion stays smooth.

const SHARPNESS = 15;

/** Frame-rate independent blend factor in [0, 1] for exponential smoothing. */
export const smoothing = (dtSeconds: number) => 1 - Math.exp(-SHARPNESS * dtSeconds);

/** Moves `from` toward `to` by `t`, taking the shortest way around the circle. */
export function approachAngle(from: number, to: number, t: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}
