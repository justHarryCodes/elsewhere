import { MAP_BOUNDS } from '@game/shared';
import { type View, fitFov } from './sceneRenderer';

const PITCH_DEG = 50;
const YAW_DEG = 25;
const FOV_DEG = 45;
const MIN_DISTANCE = 45;
const MAX_DISTANCE = 175;
/** How quickly the camera catches up with its goal (per second). */
const EASE = 6;

/**
 * The World Map camera: fixed tilt and heading, drag to pan, wheel or pinch to zoom, kept over the
 * map. It eases toward its goal, so a selected building glides into view. Renderer-agnostic: it only
 * produces a View for setView().
 */
export class MapCamera {
  private readonly goal = { x: 0, z: 0, distance: 135 };
  private readonly now = { ...this.goal };

  /** Drag by a screen delta (CSS pixels) on a viewport this big: the ground follows the pointer. */
  pan(dx: number, dy: number, viewportHeight: number, viewportWidth = viewportHeight * 1.4) {
    const yaw = (YAW_DEG * Math.PI) / 180;
    const pitch = (PITCH_DEG * Math.PI) / 180;
    // Metres per pixel at the target; ground distance along the view is stretched by the tilt.
    const fov = fitFov(FOV_DEG, viewportWidth / Math.max(1, viewportHeight));
    const k = (2 * this.now.distance * Math.tan((fov * Math.PI) / 360)) / viewportHeight;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    this.goal.x += -right.x * dx * k + forward.x * (dy * k) / Math.sin(pitch);
    this.goal.z += -right.z * dx * k + forward.z * (dy * k) / Math.sin(pitch);
    this.clamp();
    // Dragging should feel attached, not eased.
    this.now.x = this.goal.x;
    this.now.z = this.goal.z;
  }

  /** factor < 1 zooms in. */
  zoom(factor: number) {
    this.goal.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, this.goal.distance * factor));
  }

  /** Glide over a point, a little closer in. */
  focus(x: number, z: number) {
    this.goal.x = x;
    this.goal.z = z;
    this.goal.distance = Math.min(this.goal.distance, 95);
    this.clamp();
  }

  update(dt: number) {
    const t = 1 - Math.exp(-EASE * dt);
    this.now.x += (this.goal.x - this.now.x) * t;
    this.now.z += (this.goal.z - this.now.z) * t;
    this.now.distance += (this.goal.distance - this.now.distance) * t;
  }

  view(): View {
    return { target: { x: this.now.x, z: this.now.z }, distance: this.now.distance, pitchDeg: PITCH_DEG, yawDeg: YAW_DEG };
  }

  private clamp() {
    this.goal.x = Math.min(MAP_BOUNDS.maxX, Math.max(MAP_BOUNDS.minX, this.goal.x));
    this.goal.z = Math.min(MAP_BOUNDS.maxZ, Math.max(MAP_BOUNDS.minZ, this.goal.z));
  }
}
