import { ImportMeshAsync, type Scene, type TransformNode, type Vector3 } from '@babylonjs/core';
import { fitScaleFactor, type FitAxis, type RealSize, type SizeKey } from '@game/shared';

export interface RealScaleOptions {
  /** Override the catalog's fit axis for this model. */
  axis?: FitAxis;
  /** Move the model so its lowest point sits on this y (default 0). Pass false to skip. */
  groundY?: number | false;
}

/** World-space bounding size of a node and all its child meshes, in Babylon units. */
export function measureNode(node: TransformNode): Vector3 {
  node.computeWorldMatrix(true);
  const { min, max } = node.getHierarchyBoundingVectors(true);
  return max.subtract(min);
}

/** Moves a node vertically so the bottom of its bounds rests on `groundY`. */
export function snapToGround(node: TransformNode, groundY = 0) {
  node.computeWorldMatrix(true);
  const { min } = node.getHierarchyBoundingVectors(true);
  node.position.y += groundY - min.y;
}

/**
 * Uniformly scales a model so it matches its real-world size (1 unit = 1 metre).
 * Returns the factor applied, so it can be cached and reused for clones of the same asset.
 */
export function scaleToRealSize(
  node: TransformNode,
  target: SizeKey | RealSize,
  { axis, groundY = 0 }: RealScaleOptions = {},
): number {
  const factor = fitScaleFactor(measureNode(node), target, axis);
  // Multiply rather than assign: glTF roots carry a (1, 1, -1) handedness flip that must be kept.
  node.scaling.scaleInPlace(factor);
  if (groundY !== false) snapToGround(node, groundY);
  return factor;
}

/**
 * Loads a model and scales it to real-world size in one step.
 * @example const { root } = await loadRealScale(scene, '/assets/vehicles/police-car.glb', 'vehicle.policeCar');
 */
export async function loadRealScale(
  scene: Scene,
  url: string,
  target: SizeKey | RealSize,
  options?: RealScaleOptions,
) {
  const result = await ImportMeshAsync(url, scene);
  const root = result.meshes[0];
  const factor = scaleToRealSize(root, target, options);
  return { root, factor, result };
}
