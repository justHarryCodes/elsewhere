import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  GRAVITY,
  HUMAN_METRICS,
  locomotionForSpeed,
  sizeInUnits,
  type HeadlightMode,
  type HumanAnimation,
  type HumanBody,
  type SizeKey,
  type VehicleModelKey,
} from '@game/shared';
import { type HumanCharacter, HumanLibrary } from '../game/babylon/humans';
import { measureNode } from '../game/babylon/realScale';
import { SandboxVehicle, type VehicleStats } from './sandboxVehicle';

export type MoveMode = 'walk' | 'jog' | 'sprint';

export interface SandboxStats {
  loading: boolean;
  error?: string;
  body: HumanBody;
  animation?: HumanAnimation;
  moveMode: MoveMode;
  speed: number;
  grounded: boolean;
  position: { x: number; y: number; z: number };
  headingDeg: number;
  heightMeters: number;
  fps: number;
  /** Undefined until the physics engine and car have loaded. */
  vehicle?: VehicleStats;
  vehicleError?: string;
  driving: boolean;
  /** Close enough to the car to get in with E. */
  nearVehicle: boolean;
  night: boolean;
}

const MOVE_SPEEDS: Record<MoveMode, number> = {
  walk: HUMAN_METRICS.walkSpeed,
  jog: HUMAN_METRICS.runSpeed,
  sprint: HUMAN_METRICS.sprintSpeed,
};
const LOCOMOTION = new Set<HumanAnimation>(['idle', 'walk', 'jog', 'sprint']);
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const GROUND_SIZE = 200;
const CAMERA_TARGET_HEIGHT = 1.1;
const DRIVING_CAMERA_RADIUS = 9;
const ENTER_DISTANCE = 1.5; // metres from the car's outline to get in

const DAY = { sky: new Color4(0.55, 0.7, 0.85, 1), hemi: 0.7, sun: 1.6, ground: new Color3(0.42, 0.5, 0.42) };
const NIGHT = { sky: new Color4(0.02, 0.03, 0.07, 1), hemi: 0.06, sun: 0.04, ground: new Color3(0.3, 0.33, 0.36) };

// Real-size props from the scale catalog, placed around the spawn to judge proportions.
const REFERENCES: { key: SizeKey; label: string; x: number; z: number; color: string }[] = [
  { key: 'human.adultMale', label: 'Adult male 1.75 m', x: 2, z: 0, color: '#38bdf8' },
  { key: 'building.door', label: 'Door 2.1 m', x: -2.5, z: -1, color: '#a78bfa' },
  { key: 'vehicle.sedan', label: 'Sedan 4.7 m', x: 6, z: -3, color: '#f59e0b' },
  { key: 'furniture.sofa', label: 'Sofa 2.1 m', x: -5, z: -4, color: '#22c55e' },
  { key: 'street.streetLight', label: 'Street light 8 m', x: -8, z: 2, color: '#e5e7eb' },
  { key: 'building.houseTwoStory', label: 'House 8.5 m', x: 0, z: -18, color: '#ef4444' },
];

/** Offline Babylon test bed for human scale, locomotion and every library animation. */
export class MovementSandbox {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shadows: ShadowGenerator;
  private readonly keys = new Set<string>();
  private library?: HumanLibrary;
  private character?: HumanCharacter;
  private disposed = false;

  private body: HumanBody = 'male';
  private moveMode: MoveMode = 'jog';
  // Mode to return to when Shift (sprint) is released.
  private baseMoveMode: MoveMode = 'jog';
  private speed = 0;
  private velocityY = 0;
  private grounded = true;
  private heightMeters = 0;
  private showBounds = false;
  private speedRatio = 1;
  private error?: string;

  private readonly hemi: HemisphericLight;
  private readonly sun: DirectionalLight;
  private groundMaterial?: StandardMaterial;
  private vehicle?: SandboxVehicle;
  private vehicleError?: string;
  private driving = false;
  private night = false;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = new Color4(0.55, 0.7, 0.85, 1);

    this.camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2.6, 6, new Vector3(0, CAMERA_TARGET_HEIGHT, 0), this.scene);
    this.camera.lowerRadiusLimit = 1.5;
    this.camera.upperRadiusLimit = 40;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.05;
    this.camera.wheelDeltaPercentage = 0.02;
    // Arrow keys move the character, not the camera.
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    this.camera.attachControl(canvas, true);

    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    this.hemi.intensity = DAY.hemi;
    this.sun = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), this.scene);
    this.sun.position = new Vector3(20, 40, 30);
    this.sun.intensity = DAY.sun;
    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.useBlurExponentialShadowMap = true;
    // Lamps glow through their emissive colour; this layer adds the bloom around them.
    const glow = new GlowLayer('glow', this.scene, { blurKernelSize: 48 });
    glow.intensity = 0.9;

    this.createGround();
    this.createReferences();

    SandboxVehicle.create(this.scene, this.shadows, REFERENCES.map(referenceBlock))
      .then((vehicle) => {
        if (this.disposed) vehicle.dispose();
        else this.vehicle = vehicle;
      })
      .catch((error: unknown) => {
        if (this.disposed) return; // the scene went away mid-load; nothing to report
        console.error('Failed to load the vehicle sandbox', error);
        this.vehicleError = error instanceof Error ? error.message : String(error);
      });

    this.scene.onBeforeRenderObservable.add(() => this.update(this.engine.getDeltaTime() / 1000));
    this.engine.runRenderLoop(() => this.scene.render());

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);

    HumanLibrary.load(this.scene)
      .then((library) => {
        if (this.disposed) return;
        this.library = library;
        this.spawn();
      })
      .catch((error: unknown) => {
        console.error('Failed to load human assets', error);
        this.error = error instanceof Error ? error.message : String(error);
      });
  }

  setBody(body: HumanBody) {
    if (body === this.body) return;
    this.body = body;
    this.spawn();
  }

  setMoveMode(mode: MoveMode) {
    this.moveMode = mode;
    this.baseMoveMode = mode;
  }

  /** Plays any library animation; moving cancels it, one-shots return to idle when done. */
  playAnimation(animation: HumanAnimation) {
    this.character?.play(animation, { restart: true });
  }

  setSpeedRatio(ratio: number) {
    this.speedRatio = ratio;
    this.character?.setSpeedRatio(ratio);
  }

  setShowBounds(show: boolean) {
    this.showBounds = show;
    this.character?.root.getChildMeshes().forEach((mesh) => (mesh.showBoundingBox = show));
  }

  resetPosition() {
    if (!this.character) return;
    if (this.driving) this.exitVehicle();
    this.character.root.position.set(0, 0, 0);
    this.velocityY = 0;
    this.grounded = true;
  }

  setVehicleModel(model: VehicleModelKey) {
    void this.vehicle?.setModel(model);
  }

  setVehiclePaint(hex: string) {
    this.vehicle?.setPaint(hex);
  }

  setHeadlights(mode: HeadlightMode) {
    this.vehicle?.setHeadlights(mode);
  }

  setSiren(on: boolean) {
    this.vehicle?.setSiren(on);
  }

  respawnVehicle() {
    void this.vehicle?.respawn();
  }

  setNight(night: boolean) {
    this.night = night;
    const look = night ? NIGHT : DAY;
    this.scene.clearColor = look.sky;
    this.hemi.intensity = look.hemi;
    this.sun.intensity = look.sun;
    this.groundMaterial?.diffuseColor.copyFrom(look.ground);
    // Nobody drives at night with the lights off.
    if (night && this.vehicle?.getStats(this.driving).headlights === 'off') this.vehicle.setHeadlights('low');
  }

  /** Gets in when close to the car, out when driving. */
  toggleVehicle() {
    if (this.driving) this.exitVehicle();
    else if (this.isNearVehicle()) this.enterVehicle();
  }

  getStats(): SandboxStats {
    const root = this.character?.root;
    return {
      loading: !this.character && !this.error,
      error: this.error,
      body: this.body,
      animation: this.character?.animation,
      moveMode: this.moveMode,
      speed: this.speed,
      grounded: this.grounded,
      position: { x: root?.position.x ?? 0, y: root?.position.y ?? 0, z: root?.position.z ?? 0 },
      headingDeg: root ? ((root.rotation.y * 180) / Math.PI + 360) % 360 : 0,
      heightMeters: this.heightMeters,
      fps: this.engine.getFps(),
      vehicle: this.vehicle?.getStats(this.driving),
      vehicleError: this.vehicleError,
      driving: this.driving,
      nearVehicle: !this.driving && this.isNearVehicle(),
      night: this.night,
    };
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.vehicle?.dispose();
    this.engine.dispose();
  }

  private spawn() {
    if (!this.library) return;
    const previous = this.character;
    this.character = this.library.createHuman(this.body, 'sandbox');
    if (previous) {
      this.character.root.position.copyFrom(previous.root.position);
      this.character.root.rotation.y = previous.root.rotation.y;
      previous.dispose();
    }
    this.heightMeters = measureNode(this.character.root).y;
    this.character.root.getChildMeshes().forEach((mesh) => {
      this.shadows.addShadowCaster(mesh);
      mesh.showBoundingBox = this.showBounds;
    });
    this.character.setSpeedRatio(this.speedRatio);
    this.character.play('idle');
  }

  private update(dt: number) {
    const vehicle = this.vehicle;
    if (vehicle) {
      const input = this.readInput();
      vehicle.input.throttle = this.driving ? input.forward : 0;
      vehicle.input.steer = this.driving ? input.right : 0;
      vehicle.input.handbrake = this.driving && this.keys.has('Space');
      vehicle.update(dt);
      if (this.driving) {
        this.followVehicle(vehicle, dt);
        return;
      }
    }

    const character = this.character;
    if (!character) return;
    const root = character.root;

    // Camera-relative input on the ground plane.
    const input = this.readInput();
    const forward = new Vector3(-Math.cos(this.camera.alpha), 0, -Math.sin(this.camera.alpha));
    const right = new Vector3(-forward.z, 0, forward.x);
    const move = forward.scale(input.forward).add(right.scale(input.right));
    const moving = move.lengthSquared() > 0;

    this.speed = moving ? MOVE_SPEEDS[this.moveMode] : 0;
    if (moving) {
      move.normalize();
      root.position.addInPlace(move.scale(this.speed * dt));
      const half = GROUND_SIZE / 2 - 1;
      root.position.x = Math.max(-half, Math.min(half, root.position.x));
      root.position.z = Math.max(-half, Math.min(half, root.position.z));
      root.rotation.y = turnToward(root.rotation.y, Math.atan2(move.x, move.z), dt);
    }

    // Vertical motion: jump with real gravity, land back on y = 0.
    if (!this.grounded) {
      this.velocityY += GRAVITY * dt;
      root.position.y += this.velocityY * dt;
      if (root.position.y <= 0) {
        root.position.y = 0;
        this.velocityY = 0;
        this.grounded = true;
        if (!moving) character.play('jumpLand', { then: 'idle' });
      }
    }

    // Animation state: airborne keeps the jump chain, moving overrides actions, otherwise
    // locomotion settles to idle and any action (or landing) plays out on its own.
    if (this.grounded) {
      const current = character.animation;
      if (moving) character.play(locomotionForSpeed(this.speed));
      else if (!current || LOCOMOTION.has(current)) character.play('idle');
    }

    // Camera follows the character; orbit and zoom stay under mouse control.
    const target = root.position.add(new Vector3(0, CAMERA_TARGET_HEIGHT, 0));
    this.camera.target = Vector3.Lerp(this.camera.target, target, 1 - Math.exp(-10 * dt));
  }

  // Chase camera: target rides with the car and the orbit swings round behind it. Mouse drag still
  // works; the camera eases back behind the car afterwards.
  private followVehicle(vehicle: SandboxVehicle, dt: number) {
    const root = vehicle.root;
    if (!root) return;
    const target = root.position.add(new Vector3(0, CAMERA_TARGET_HEIGHT, 0));
    // Move the target in place: assigning camera.target keeps the camera where it is and shrinks
    // the orbit radius as the car pulls away; in place keeps the radius and moves the camera.
    this.camera.target.copyFrom(Vector3.Lerp(this.camera.target, target, 1 - Math.exp(-12 * dt)));
    const heading = vehicle.heading;
    const behind = Math.atan2(-Math.cos(heading), -Math.sin(heading));
    const delta = Math.atan2(Math.sin(behind - this.camera.alpha), Math.cos(behind - this.camera.alpha));
    this.camera.alpha += delta * (1 - Math.exp(-2.5 * dt));
  }

  private isNearVehicle(): boolean {
    const root = this.character?.root;
    return !!root && !!this.vehicle && this.vehicle.distanceTo(root.position) < ENTER_DISTANCE;
  }

  private enterVehicle() {
    if (!this.vehicle || !this.character) return;
    this.driving = true;
    this.speed = 0;
    this.character.root.setEnabled(false);
    this.camera.radius = Math.max(this.camera.radius, DRIVING_CAMERA_RADIUS);
  }

  private exitVehicle() {
    if (!this.vehicle || !this.character) return;
    this.driving = false;
    const { x, z, heading } = this.vehicle.exitPoint();
    const root = this.character.root;
    root.position.set(x, 0, z);
    root.rotation.y = heading;
    root.setEnabled(true);
    this.grounded = true;
    this.velocityY = 0;
    this.character.play('idle');
  }

  private jump() {
    if (!this.character || !this.grounded) return;
    this.grounded = false;
    this.velocityY = Math.sqrt(2 * -GRAVITY * HUMAN_METRICS.jumpHeight);
    this.character.play('jumpStart', { restart: true, then: 'jumpLoop' });
  }

  private readInput() {
    const held = (codes: string[]) => (codes.some((code) => this.keys.has(code)) ? 1 : 0);
    return {
      forward: held(KEYS.forward) - held(KEYS.back),
      right: held(KEYS.right) - held(KEYS.left),
    };
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (this.driving) this.keys.add(event.code); // handbrake while held
      else if (!event.repeat) this.jump();
      return;
    }
    if (!event.repeat) {
      if (event.code === 'KeyE') this.toggleVehicle();
      if (event.code === 'KeyL') this.vehicle?.cycleHeadlights();
      if (event.code === 'KeyK') this.vehicle?.setSiren(!this.vehicle.getStats(this.driving).siren);
      if (event.code === 'KeyN') this.setNight(!this.night);
    }
    this.keys.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.moveMode = 'sprint';
    if (event.code === 'KeyC' && !event.repeat) this.setMoveMode(this.baseMoveMode === 'walk' ? 'jog' : 'walk');
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.moveMode = this.baseMoveMode;
  };

  private onBlur = () => this.keys.clear();
  private onResize = () => this.engine.resize();

  private createGround() {
    const ground = MeshBuilder.CreateGround('ground', { width: GROUND_SIZE, height: GROUND_SIZE }, this.scene);
    const material = new StandardMaterial('ground-mat', this.scene);
    material.diffuseColor = DAY.ground.clone();
    material.specularColor = Color3.Black();
    ground.material = material;
    this.groundMaterial = material;
    ground.receiveShadows = true;

    // 1 m grid, every 5th line brighter, so distances can be read off the ground.
    const half = GROUND_SIZE / 2;
    const minor: Vector3[][] = [];
    const major: Vector3[][] = [];
    for (let i = -half; i <= half; i++) {
      const lines = i % 5 === 0 ? major : minor;
      lines.push([new Vector3(i, 0.005, -half), new Vector3(i, 0.005, half)]);
      lines.push([new Vector3(-half, 0.005, i), new Vector3(half, 0.005, i)]);
    }
    MeshBuilder.CreateLineSystem('grid-minor', { lines: minor }, this.scene).color = new Color3(0.33, 0.4, 0.33);
    MeshBuilder.CreateLineSystem('grid-major', { lines: major }, this.scene).color = new Color3(0.85, 0.9, 0.85);
  }

  private createReferences() {
    for (const ref of REFERENCES) {
      const size = sizeInUnits(ref.key);
      const box = MeshBuilder.CreateBox(
        `ref-${ref.key}`,
        { width: size.length, height: size.height, depth: size.width },
        this.scene,
      );
      box.position.set(ref.x, size.height / 2, ref.z);
      const material = new StandardMaterial(`ref-mat-${ref.key}`, this.scene);
      material.diffuseColor = Color3.FromHexString(ref.color);
      material.alpha = 0.35;
      box.material = material;
      box.enableEdgesRendering();
      box.edgesColor = Color4.FromHexString(`${ref.color}ff`);
      box.edgesWidth = 2;
      this.shadows.addShadowCaster(box);

      this.createLabel(ref.label, new Vector3(ref.x, size.height + 0.35, ref.z));
    }
  }

  private createLabel(text: string, position: Vector3): Mesh {
    const texture = new DynamicTexture(`label-${text}`, { width: 512, height: 96 }, this.scene, true);
    texture.hasAlpha = true;
    texture.drawText(text, null, 64, 'bold 44px sans-serif', '#ffffff', 'rgba(15,23,42,0.75)', true);

    const plane = MeshBuilder.CreatePlane(`label-${text}`, { width: 2.4, height: 0.45 }, this.scene);
    const material = new StandardMaterial(`label-mat-${text}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    plane.material = material;
    plane.position = position;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    return plane;
  }
}

// The reference boxes are solid for the car: same footprint as the drawn box (length along X).
function referenceBlock(ref: (typeof REFERENCES)[number]) {
  const size = sizeInUnits(ref.key);
  return { x: ref.x, z: ref.z, width: size.length, depth: size.width, height: size.height };
}

function turnToward(from: number, to: number, dt: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * (1 - Math.exp(-14 * dt));
}

function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
