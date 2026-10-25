import { Color3, DynamicTexture, Mesh, MeshBuilder, type Scene, StandardMaterial, Texture } from '@babylonjs/core';

// The sky, painted once into two panoramas (day and night) on a dome round the camera. Day: blue
// overhead fading to a pale haze at the horizon, with drifting clouds. Night: deep blue with stars, a
// moon, and the city's glow warming the horizon.

const WIDTH = 2048;
const HEIGHT = 1024;
/** The panorama's horizon line (the dome's equator), from the top. */
const HORIZON = HEIGHT / 2;

/** Colours where the sky meets the ground, for the fog to blend into. */
export const SKY_HORIZON = { day: new Color3(0.74, 0.83, 0.93), night: new Color3(0.11, 0.12, 0.22) };

export class SkyDome {
  readonly mesh: Mesh;
  private readonly day: DynamicTexture;
  private readonly night: DynamicTexture;
  private readonly material: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.mesh = MeshBuilder.CreateSphere('sky', { diameter: 1800, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.infiniteDistance = true; // always round the camera, never closer
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.material = new StandardMaterial('sky', scene);
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.mesh.material = this.material;
    this.day = this.paint('sky-day', paintDay);
    this.night = this.paint('sky-night', paintNight);
    this.set(false);
  }

  set(night: boolean) {
    this.material.emissiveTexture = night ? this.night : this.day;
  }

  private paint(name: string, draw: (ctx: CanvasRenderingContext2D, random: () => number) => void) {
    const texture = new DynamicTexture(name, { width: WIDTH, height: HEIGHT }, this.scene, true);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    draw(texture.getContext() as CanvasRenderingContext2D, random);
    texture.update(false);
    return texture;
  }

  dispose() {
    this.day.dispose();
    this.night.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

const rgb = (c: Color3, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;

/** A soft round blob, for clouds and glows. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string, edge: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, colour);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws something on the panorama, twice where it crosses the seam so the sky wraps without a join. */
function wrapped(x: number, width: number, draw: (x: number) => void) {
  draw(x);
  if (x - width < 0) draw(x + WIDTH);
  if (x + width > WIDTH) draw(x - WIDTH);
}

function paintDay(ctx: CanvasRenderingContext2D, random: () => number) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#2f6fc4');
  sky.addColorStop(0.3, '#5d97db');
  sky.addColorStop(0.47, rgb(SKY_HORIZON.day));
  sky.addColorStop(0.5, rgb(SKY_HORIZON.day));
  sky.addColorStop(1, '#9fb2c4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Clouds: clumps of soft puffs, flatter and smaller toward the horizon (further away).
  for (let c = 0; c < 70; c++) {
    const y = HORIZON * (0.25 + random() * 0.68);
    const far = y / HORIZON; // 0 overhead .. 1 at the horizon
    const x = random() * WIDTH;
    const size = (90 - far * 55) * (0.6 + random() * 0.8);
    const puffs = 4 + Math.floor(random() * 6);
    for (let p = 0; p < puffs; p++) {
      const px = x + (random() - 0.5) * size * 2.6;
      const py = y + (random() - 0.5) * size * 0.35;
      const r = size * (0.45 + random() * 0.55);
      wrapped(px, r, (wx) => {
        blob(ctx, wx, py + r * 0.12, r, r * (0.42 - far * 0.18), 'rgba(170,185,205,0.35)', 'rgba(170,185,205,0)');
        blob(ctx, wx, py, r, r * (0.4 - far * 0.18), 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)');
      });
    }
  }
}

function paintNight(ctx: CanvasRenderingContext2D, random: () => number) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, '#03061a');
  sky.addColorStop(0.3, '#0a1238');
  sky.addColorStop(0.44, '#1c2150');
  sky.addColorStop(0.5, rgb(SKY_HORIZON.night));
  sky.addColorStop(1, '#0c0d18');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // The city's lights glowing on the haze along the horizon.
  const glow = ctx.createLinearGradient(0, HORIZON - 120, 0, HORIZON);
  glow.addColorStop(0, 'rgba(255,150,90,0)');
  glow.addColorStop(1, 'rgba(255,150,90,0.28)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, HORIZON - 120, WIDTH, 120);
  // Stars, fewer and fainter down toward the glow.
  for (let s = 0; s < 1400; s++) {
    const y = HORIZON * Math.pow(random(), 1.4) * 0.92;
    const x = random() * WIDTH;
    const bright = (0.35 + random() * 0.65) * (1 - y / HORIZON);
    const r = random() < 0.06 ? 1.6 : 0.9;
    ctx.fillStyle = `rgba(${random() < 0.2 ? '255,230,200' : '220,230,255'},${bright})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few thin clouds catching the city light.
  for (let c = 0; c < 18; c++) {
    const x = random() * WIDTH;
    const y = HORIZON * (0.55 + random() * 0.35);
    const r = 60 + random() * 90;
    wrapped(x, r, (wx) => blob(ctx, wx, y, r * 1.8, r * 0.18, 'rgba(90,80,120,0.35)', 'rgba(90,80,120,0)'));
  }
  // The moon, with its halo.
  const mx = WIDTH * 0.62;
  const my = HORIZON * 0.38;
  blob(ctx, mx, my, 140, 140, 'rgba(180,200,255,0.22)', 'rgba(180,200,255,0)');
  blob(ctx, mx, my, 26, 26, 'rgba(250,250,240,1)', 'rgba(235,238,230,1)');
  ctx.fillStyle = 'rgba(200,205,210,0.35)';
  for (const [dx, dy, r] of [[-7, -5, 6], [8, 6, 4], [3, -10, 3]]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
