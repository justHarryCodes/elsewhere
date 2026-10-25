import {
  type Camera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  type DirectionalLight,
  type HemisphericLight,
  ImageProcessingConfiguration,
  PointLight,
  type Scene,
  Vector3,
} from '@babylonjs/core';
import { SKY_HORIZON, SkyDome } from './sky';

/** Sky, fog, light and grading for one time of day. */
interface Look {
  sky: Color4;
  fogDensity: number;
  hemi: number;
  hemiSky: Color3;
  hemiGround: Color3;
  sun: number;
  sunColor: Color3;
  env: number;
  bloomWeight: number;
  bloomThreshold: number;
  exposure: number;
  contrast: number;
  vignette: number;
  aberration: number;
}

// Day: blue sky with clouds (the sky dome), a pale haze toward the horizon.
const DAY: Look = {
  sky: new Color4(SKY_HORIZON.day.r, SKY_HORIZON.day.g, SKY_HORIZON.day.b, 1),
  fogDensity: 0.0018,
  hemi: 0.7,
  hemiSky: new Color3(1, 1, 1),
  hemiGround: new Color3(0.35, 0.33, 0.4),
  sun: 1.6,
  sunColor: new Color3(1, 0.97, 0.92),
  env: 1,
  bloomWeight: 0.25,
  bloomThreshold: 0.85,
  exposure: 1,
  contrast: 1.1,
  vignette: 1.2,
  aberration: 0,
};

// Night: a big city after dark. A deep blue starry sky warmed by the city's glow at the horizon, a
// bright moon and plenty of cool ambient light, so streets and buildings read clearly; lit windows,
// street lamps, shop neon and car lights do the rest, with bloom round everything bright.
const NIGHT: Look = {
  sky: new Color4(SKY_HORIZON.night.r, SKY_HORIZON.night.g, SKY_HORIZON.night.b, 1),
  fogDensity: 0.0024,
  hemi: 0.85,
  hemiSky: new Color3(0.5, 0.58, 0.9),
  hemiGround: new Color3(0.32, 0.26, 0.24),
  sun: 0.45,
  sunColor: new Color3(0.62, 0.72, 1),
  env: 0.3,
  bloomWeight: 0.4,
  bloomThreshold: 0.7,
  exposure: 1.3,
  contrast: 1.12,
  vignette: 1.6,
  aberration: 0,
};

/**
 * The look of the world at day or night: sky colour and fog, the ambient and sun lights, and a
 * post-process pipeline (bloom, contrast, vignette, a touch of chromatic aberration at night).
 */
export class Atmosphere {
  readonly pipeline: DefaultRenderingPipeline;
  night = false;
  /** A soft light that hangs over the player at night, so they never become a silhouette. */
  private readonly playerLight: PointLight;
  private readonly sky: SkyDome;

  constructor(
    private readonly scene: Scene,
    camera: Camera,
    private readonly hemi: HemisphericLight,
    private readonly sun: DirectionalLight,
  ) {
    scene.fogMode = 2; // Scene.FOGMODE_EXP2
    scene.fogColor = new Color3();
    this.pipeline = new DefaultRenderingPipeline('atmosphere', true, scene, [camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomKernel = 64;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.imageProcessingEnabled = true;
    const image = this.pipeline.imageProcessing;
    image.toneMappingEnabled = true;
    image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    image.vignetteEnabled = true;
    image.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    image.vignetteColor = new Color4(0.02, 0.02, 0.06, 0);
    this.pipeline.chromaticAberrationEnabled = true;
    this.playerLight = new PointLight('player-light', new Vector3(0, 3, 0), scene);
    this.playerLight.diffuse = new Color3(1, 0.9, 0.8);
    this.playerLight.specular = new Color3(0.3, 0.2, 0.3);
    this.playerLight.intensity = 6;
    this.playerLight.range = 9;
    this.sky = new SkyDome(scene);
    this.set(false);
  }

  /** Keeps the player's light over them; call every frame with their position. */
  follow(position: { x: number; y: number; z: number }) {
    this.playerLight.position.set(position.x + 1, position.y + 3.2, position.z + 1);
  }

  set(night: boolean) {
    this.night = night;
    const look = night ? NIGHT : DAY;
    const scene = this.scene;
    scene.clearColor = look.sky.clone();
    scene.fogColor.set(look.sky.r, look.sky.g, look.sky.b);
    scene.fogDensity = look.fogDensity;
    this.hemi.intensity = look.hemi;
    this.hemi.diffuse = look.hemiSky.clone();
    this.hemi.groundColor = look.hemiGround.clone();
    this.sun.intensity = look.sun;
    this.playerLight.setEnabled(night);
    this.sky.set(night);
    this.sun.diffuse = look.sunColor.clone();
    scene.environmentIntensity = look.env;
    const p = this.pipeline;
    p.bloomWeight = look.bloomWeight;
    p.bloomThreshold = look.bloomThreshold;
    p.imageProcessing.exposure = look.exposure;
    p.imageProcessing.contrast = look.contrast;
    p.imageProcessing.vignetteWeight = look.vignette;
    p.chromaticAberration.aberrationAmount = look.aberration;
  }
}
