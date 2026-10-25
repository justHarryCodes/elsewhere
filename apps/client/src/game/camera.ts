// Follow-camera tuning shared by the Babylon and Three.js renderers.

const degrees = (value: number) => (value * Math.PI) / 180;

/** How far the camera looks down at the player: 0 = level with the ground, 90 = straight down. */
export const CAMERA_PITCH_DEG = 60;
/** Angle from straight up, which is what both engines' orbit cameras use. */
export const CAMERA_POLAR = degrees(90 - CAMERA_PITCH_DEG);

export const CAMERA_DISTANCE = 32; // metres from the player: bigger = more zoomed out
export const CAMERA_MIN_DISTANCE = 12; // closest the mouse wheel can zoom
export const CAMERA_MAX_DISTANCE = 60; // farthest the mouse wheel can zoom
export const CAMERA_TARGET_HEIGHT = 1; // aim at chest height instead of the feet (set 0 for feet)
