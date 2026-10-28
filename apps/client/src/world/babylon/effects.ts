import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Light,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  type Scene,
  SpotLight,
  StandardMaterial,
  type Texture,
  Vector3,
} from '@babylonjs/core';
import type { EffectDef } from '@game/shared';

/** What one running effect leaves behind to animate and to dispose. */
interface Running {
  particles: ParticleSystem[];
  meshes: Mesh[];
  lights: Light[];
  /** Called every frame with the time since it started (seconds). */
  update?: (t: number) => void;
  dispose?: () => void;
}

/**
 * Water, steam, heat, sleep and club lights for furniture actions. Light stays gentle (the scene is
 * tone-mapped and each light is short-ranged and dim), so an effect reads without washing the room out.
 */
export class Effects {
  private readonly groups = new Map<string, Running[]>();
  private readonly spot: Texture;
  private readonly zed: Texture;
  /** A light shaft: bright at the lamp, fading to nothing toward the floor (and at its sides). */
  private readonly shaft: Texture;
  private time = 0;

  constructor(private readonly scene: Scene) {
    this.spot = texture(scene, 'fx-spot', (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    this.zed = texture(scene, 'fx-z', (ctx) => {
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(40,40,90,0.9)';
      ctx.strokeText('Z', 32, 34);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillText('Z', 32, 34);
    });
    this.shaft = texture(scene, 'fx-shaft', (ctx) => {
      const down = ctx.createLinearGradient(0, 0, 0, 64);
      down.addColorStop(0, 'rgba(255,255,255,0.85)');
      down.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = down;
      ctx.fillRect(0, 0, 64, 64);
    });
    scene.onBeforeRenderObservable.add(() => {
      this.time += scene.getEngine().getDeltaTime() / 1000;
      for (const list of this.groups.values()) for (const r of list) r.update?.(this.time);
    });
  }

  play(group: string, effects: readonly EffectDef[]) {
    this.stop(group);
    const start = this.time;
    this.groups.set(
      group,
      effects.map((e) => {
        const running = this.make(e);
        const update = running.update;
        if (update) running.update = (t) => update(t - start);
        return running;
      }),
    );
  }

  stop(group: string) {
    for (const r of this.groups.get(group) ?? []) {
      for (const p of r.particles) {
        p.stop();
        // Let what's in the air fall or fade before it goes.
        window.setTimeout(() => p.dispose(), 2500);
      }
      for (const m of r.meshes) {
        m.material?.dispose();
        m.dispose();
      }
      for (const l of r.lights) l.dispose();
      r.dispose?.();
    }
    this.groups.delete(group);
  }

  stopAll() {
    for (const group of [...this.groups.keys()]) this.stop(group);
  }

  private make(e: EffectDef): Running {
    const at = new Vector3(e.x, e.y, e.z);
    switch (e.kind) {
      case 'shower': {
        // The downpour: streaks falling from the shower head, and splashes where they land.
        const rain = this.particles('shower', 900, at, {
          box: [0.18, 0.02, 0.18], dir: [[-0.15, -1, -0.15], [0.15, -1, 0.15]], power: [3.2, 4.2], life: [0.45, 0.6],
          size: [0.07, 0.1], rate: 700, color: [0.55, 0.75, 0.95, 0.75], gravity: -9, stretched: true, standard: true,
        });
        const splash = this.particles('splash', 400, at.add(new Vector3(0, -2.1, 0)), {
          box: [0.35, 0, 0.35], dir: [[-1, 1.2, -1], [1, 2, 1]], power: [0.6, 1.3], life: [0.15, 0.35],
          size: [0.03, 0.05], rate: 220, color: [0.7, 0.85, 0.97, 0.7], gravity: -9, standard: true,
        });
        return { particles: [rain, splash], meshes: [], lights: [] };
      }
      case 'tap': {
        const stream = this.particles('tap', 200, at, {
          box: [0.01, 0, 0.01], dir: [[0, -1, 0], [0, -1, 0]], power: [0.9, 1.1], life: [0.25, 0.3],
          size: [0.03, 0.04], rate: 160, color: [0.62, 0.8, 0.95, 0.7], gravity: -6, stretched: true, standard: true,
        });
        return { particles: [stream], meshes: [], lights: [] };
      }
      case 'steam': {
        // Soft puffs that rise, swell and thin out: steam off hot water, a kettle or a pan. Blended,
        // not added, so however many overlap they stay a see-through mist, never a white blot.
        const steam = this.particles('steam', 80, at, {
          box: [e.size * 0.35, 0.05, e.size * 0.35], dir: [[-0.15, 1, -0.15], [0.15, 1, 0.15]], power: [0.25, 0.45], life: [2.5, 3.5],
          size: [0.25, 0.4], rate: 4 + e.size * 4, color: [0.93, 0.95, 0.97, 0.1], gravity: 0.05, grow: 2.5, standard: true,
        });
        return { particles: [steam], meshes: [], lights: [] };
      }
      case 'hot': {
        // A warm glow on the hob, a faint flicker of heat light, and a wisp of smoke.
        const glow = this.disc(at, e.size, new Color3(1, 0.35, 0.08).scale(0.55));
        const light = new PointLight('fx-hot', at.add(new Vector3(0, 0.25, 0)), this.scene);
        light.diffuse = new Color3(1, 0.5, 0.2);
        light.range = 2.2;
        const smoke = this.particles('smoke', 60, at.add(new Vector3(0, 0.2, 0)), {
          box: [0.15, 0, 0.15], dir: [[-0.1, 1, -0.1], [0.1, 1, 0.1]], power: [0.3, 0.5], life: [2, 3],
          size: [0.2, 0.35], rate: 4, color: [0.5, 0.5, 0.5, 0.1], gravity: 0.03, grow: 3, standard: true,
        });
        return {
          particles: [smoke], meshes: [glow], lights: [light],
          update: (t) => {
            light.intensity = 0.35 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29);
          },
        };
      }
      case 'bathWater': {
        // The water in the tub: a pale blue surface that rises as the bath fills and ripples gently.
        const water = MeshBuilder.CreateGround('fx-water', { width: e.size, height: 0.5 }, this.scene);
        water.position.copyFrom(at);
        water.rotation.y = e.heading - Math.PI / 2;
        const mat = new StandardMaterial('fx-water', this.scene);
        mat.diffuseColor = new Color3(0.45, 0.7, 0.9);
        mat.specularColor = new Color3(0.6, 0.7, 0.8);
        mat.specularPower = 48;
        mat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        mat.alpha = 0.55;
        water.material = mat;
        water.isPickable = false;
        const base = at.y;
        return {
          particles: [], meshes: [water], lights: [],
          update: (t) => {
            const fill = Math.min(1, t / 2.5);
            water.position.y = base - 0.18 * (1 - fill) + 0.008 * Math.sin(t * 3);
            water.scaling.x = 1 + 0.01 * Math.sin(t * 2.2);
          },
        };
      }
      case 'sleepy': {
        // Zzz drifting up, and the room dimmed to a warm low light.
        const z = this.particles('zzz', 20, at, {
          box: [0.05, 0, 0.05], dir: [[0.1, 1, -0.1], [0.3, 1, 0.1]], power: [0.25, 0.35], life: [2.4, 3],
          size: [0.07, 0.1], rate: 1.2, color: [1, 1, 1, 0.9], gravity: 0, grow: 1.8, texture: this.zed, standard: true,
        });
        const config = this.scene.imageProcessingConfiguration;
        const exposure = config.exposure;
        return {
          particles: [z], meshes: [], lights: [],
          update: (t) => {
            config.exposure = exposure * (1 - 0.25 * Math.min(1, t / 2));
          },
          dispose: () => {
            config.exposure = exposure;
          },
        };
      }
      case 'screen': {
        // A screen's flickering light on the face and the room in front of it.
        const light = new PointLight('fx-screen', at.add(new Vector3(Math.sin(e.heading) * 0.4, 0, Math.cos(e.heading) * 0.4)), this.scene);
        light.range = 3.5;
        return {
          particles: [], meshes: [], lights: [light],
          update: (t) => {
            const hue = (t * 0.07) % 1;
            light.diffuse = Color3.FromHSV(200 + 80 * Math.sin(hue * Math.PI * 2), 0.35, 1);
            light.intensity = 0.32 + 0.1 * Math.sin(t * 7) * Math.sin(t * 2.3);
          },
        };
      }
      case 'club': {
        // RGB beams sweeping the floor from overhead, their light following them, and a little haze.
        const colors = [new Color3(1, 0.1, 0.55), new Color3(0.1, 0.8, 1), new Color3(0.55, 0.2, 1)];
        // The rig hangs this far over the floor (the effect's point is the rig).
        const drop = 4.5;
        const meshes: Mesh[] = [];
        const lights: Light[] = [];
        const rigs = colors.map((color, i) => {
          const pivot = new Vector3(at.x + (i - 1) * e.size * 0.25, at.y, at.z);
          const beam = MeshBuilder.CreateCylinder('fx-beam', { height: drop, diameterTop: 0.12, diameterBottom: 1.4, tessellation: 16, cap: Mesh.NO_CAP }, this.scene);
          beam.setPivotPoint(new Vector3(0, drop / 2, 0));
          beam.position.set(pivot.x, pivot.y - drop / 2, pivot.z);
          beam.material = this.additive(color.scale(0.22), this.shaft);
          beam.isPickable = false;
          meshes.push(beam);
          const light = new SpotLight('fx-club', pivot, new Vector3(0, -1, 0), Math.PI / 7, 2, this.scene);
          light.diffuse = color;
          light.intensity = 1.6;
          light.range = drop + 3;
          lights.push(light);
          return { beam, light, phase: i * 2.1 };
        });
        const haze = this.particles('haze', 60, new Vector3(at.x, at.y - drop + 1.2, at.z), {
          box: [e.size * 0.5, 0.6, e.size * 0.5], dir: [[-0.05, 0.02, -0.05], [0.05, 0.05, 0.05]], power: [0.1, 0.2], life: [5, 8],
          size: [1.5, 2.5], rate: 5, color: [0.8, 0.75, 1, 0.04], gravity: 0, standard: true,
        });
        return {
          particles: [haze], meshes, lights,
          update: (t) => {
            for (const { beam, light, phase } of rigs) {
              const ax = 0.45 * Math.sin(t * 0.9 + phase);
              const az = 0.35 * Math.sin(t * 0.7 + phase * 1.7);
              beam.rotation.set(az, 0, -ax);
              light.direction.set(Math.sin(ax), -1, Math.sin(az));
              const hue = (t * 40 + phase * 60) % 360;
              const color = Color3.FromHSV(hue, 0.85, 1);
              light.diffuse = color;
              (beam.material as StandardMaterial).emissiveColor = color.scale(0.22);
            }
          },
        };
      }
    }
  }

  private particles(
    name: string,
    capacity: number,
    at: Vector3,
    o: {
      box: [number, number, number];
      dir: [[number, number, number], [number, number, number]];
      power: [number, number];
      life: [number, number];
      size: [number, number];
      rate: number;
      color: [number, number, number, number];
      gravity: number;
      stretched?: boolean;
      grow?: number;
      texture?: Texture;
      standard?: boolean;
    },
  ) {
    const p = new ParticleSystem(`fx-${name}`, capacity, this.scene);
    p.particleTexture = o.texture ?? this.spot;
    p.emitter = at.clone();
    p.minEmitBox = new Vector3(-o.box[0], -o.box[1], -o.box[2]);
    p.maxEmitBox = new Vector3(o.box[0], o.box[1], o.box[2]);
    p.direction1 = new Vector3(...o.dir[0]);
    p.direction2 = new Vector3(...o.dir[1]);
    p.minEmitPower = o.power[0];
    p.maxEmitPower = o.power[1];
    p.minLifeTime = o.life[0];
    p.maxLifeTime = o.life[1];
    p.minSize = o.size[0];
    p.maxSize = o.size[1];
    p.emitRate = o.rate;
    p.gravity = new Vector3(0, o.gravity, 0);
    const c = new Color4(...o.color);
    p.color1 = c;
    p.color2 = c;
    p.colorDead = new Color4(o.color[0], o.color[1], o.color[2], 0);
    p.blendMode = o.standard ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
    if (o.stretched) p.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    if (o.grow) {
      p.addSizeGradient(0, 1);
      p.addSizeGradient(1, o.grow);
    }
    p.start();
    return p;
  }

  private disc(at: Vector3, size: number, color: Color3) {
    const disc = MeshBuilder.CreateDisc('fx-disc', { radius: size / 2, tessellation: 24 }, this.scene);
    disc.rotation.x = Math.PI / 2;
    disc.position.copyFrom(at);
    disc.material = this.additive(color, this.spot);
    disc.isPickable = false;
    return disc;
  }

  private additive(color: Color3, opacity?: Texture) {
    const m = new StandardMaterial('fx-glow', this.scene);
    m.disableLighting = true;
    m.diffuseColor = Color3.Black();
    m.emissiveColor = color;
    if (opacity) m.opacityTexture = opacity;
    m.alphaMode = Constants.ALPHA_ADD;
    m.disableDepthWrite = true;
    m.backFaceCulling = false;
    return m;
  }
}

function texture(scene: Scene, name: string, draw: (ctx: CanvasRenderingContext2D) => void) {
  const t = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 64, 64);
  draw(ctx);
  t.update();
  t.hasAlpha = true;
  return t;
}
