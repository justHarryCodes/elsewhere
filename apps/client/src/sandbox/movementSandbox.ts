import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HDRCubeTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  type Observer,
  Plane,
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
  type PaintFinish,
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
  /** Walking to the door, opening it, sitting down or climbing out. */
  boarding: boolean;
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
const EXIT_MAX_SPEED = 10 / 3.6; // m/s; you can't step out of a moving car
// Where the pelvis sits relative to the character's origin in the driving clip (measured).
const SEATED_HIP_HEIGHT = 0.69;
const SEATED_HIP_BACK = 0.19;
// Top of the head above the character's origin in that pose, plus a little headroom.
const SEATED_HEAD_TOP = 1.49;
// The clip is a chair-height sitting pose; a car seat is lower, so the legs would poke out under the
// car. Everything of the driver below this height (car frame) is cut away; it's inside the body anyway.
const DRIVER_CLIP_HEIGHT = 0.3;
const DOOR_OPEN_SECONDS = 1.2; // how much of the reach-and-pull "interact" clip to play at the door

/** Getting in and out, step by step. */
type Boarding =
  | { phase: 'toDoor'; elapsed: number }
  | { phase: 'opening'; left: number }
  | { phase: 'sitting' | 'standing'; t: number; duration: number; from: Vector3; fromHeading: number };

const DAY = { sky: new Color4(0.55, 0.7, 0.85, 1), hemi: 0.7, sun: 1.6, env: 1, ground: new Color3(0.42, 0.5, 0.42) };
const NIGHT = { sky: new Color4(0.02, 0.03, 0.07, 1), hemi: 0.06, sun: 0.04, env: 0.05, ground: new Color3(0.3, 0.33, 0.36) };

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
  private boarding?: Boarding;
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
    // Sky reflections: metallic and clear-coated paint (and every glTF material) light from this.
    this.scene.environmentTexture = new HDRCubeTexture('/assets/environment/sky.hdr', this.scene, 256, false, true, false, true);
    this.scene.environmentIntensity = DAY.env;

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
    this.detachDriver();
    this.driving = false;
    this.boarding = undefined;
    this.character.root.setEnabled(true);
    this.character.root.rotation.set(0, 0, 0);
    this.character.play('idle');
    this.character.root.position.set(0, 0, 0);
    this.velocityY = 0;
    this.grounded = true;
  }

  setVehicleModel(model: VehicleModelKey) {
    void this.rebuildVehicle((vehicle) => vehicle.setModel(model));
  }

  setVehiclePaint(hex: string) {
    this.vehicle?.setPaint(hex);
  }

  setPaintFinish(finish: PaintFinish) {
    this.vehicle?.setFinish(finish);
  }

  setHeadlights(mode: HeadlightMode) {
    this.vehicle?.setHeadlights(mode);
  }

  setSiren(on: boolean) {
    this.vehicle?.setSiren(on);
  }

  respawnVehicle() {
    void this.rebuildVehicle((vehicle) => vehicle.respawn());
  }

  // Swapping or respawning the car replaces its scene nodes; take the driver off first so they
  // aren't disposed with the old car, then put them back in the new one.
  private async rebuildVehicle(action: (vehicle: SandboxVehicle) => Promise<void>) {
    const vehicle = this.vehicle;
    if (!vehicle || !this.character) return;
    if (this.boarding) {
      this.boarding = undefined;
      this.character.root.setEnabled(true);
      this.character.play('idle');
    }
    const wasDriving = this.driving;
    this.detachDriver();
    await action(vehicle);
    if (wasDriving) this.attachDriver(vehicle);
  }

  private attachDriver(vehicle: SandboxVehicle) {
    const root = this.character!.root;
    root.parent = vehicle.root!;
    root.position.copyFrom(this.seatedOrigin(vehicle));
    root.rotation.set(0, 0, 0);
    root.setEnabled(vehicle.driverVisible);
    this.character!.play('driving');
    this.clipDriver(vehicle);
  }

  /** Character origin when seated, in the car's frame: hips on the seat, head under the roof. */
  private seatedOrigin(vehicle: SandboxVehicle): Vector3 {
    const { x, y, z } = vehicle.seat;
    const originY = Math.min(y - SEATED_HIP_HEIGHT, vehicle.roofTop - SEATED_HEAD_TOP);
    return new Vector3(x, originY, z + SEATED_HIP_BACK);
  }

  private readonly clipObservers: { mesh: Mesh; before: Observer<Mesh>; after: Observer<Mesh> }[] = [];

  // Cuts the driver off at the car's floor while they're drawn (a per-mesh clip plane that follows
  // the car, so it tilts with it on hills and ramps).
  private clipDriver(vehicle: SandboxVehicle) {
    this.unclipDriver();
    const plane = new Plane(0, -1, 0, 0);
    const meshes = this.character!.root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh);
    for (const mesh of meshes) {
      const before = mesh.onBeforeRenderObservable.add(() => {
        const carRoot = vehicle.root;
        if (!carRoot) return;
        const world = carRoot.getWorldMatrix();
        const up = Vector3.TransformNormal(Vector3.Up(), world).normalize();
        const floor = Vector3.TransformCoordinates(new Vector3(0, DRIVER_CLIP_HEIGHT, 0), world);
        // Babylon discards fragments where dot(plane, position) > 0: keep everything above the floor.
        plane.normal.copyFrom(up).scaleInPlace(-1);
        plane.d = Vector3.Dot(up, floor);
        this.scene.clipPlane = plane;
      });
      const after = mesh.onAfterRenderObservable.add(() => {
        this.scene.clipPlane = null;
      });
      this.clipObservers.push({ mesh, before: before!, after: after! });
    }
  }

  private unclipDriver() {
    for (const { mesh, before, after } of this.clipObservers) {
      mesh.onBeforeRenderObservable.remove(before);
      mesh.onAfterRenderObservable.remove(after);
    }
    this.clipObservers.length = 0;
    this.scene.clipPlane = null;
  }

  private detachDriver() {
    this.unclipDriver();
    const root = this.character?.root;
    if (!root?.parent) return;
    const world = root.getAbsolutePosition().clone();
    root.parent = null;
    root.position.copyFrom(world);
  }

  setNight(night: boolean) {
    this.night = night;
    const look = night ? NIGHT : DAY;
    this.scene.clearColor = look.sky;
    this.hemi.intensity = look.hemi;
    this.sun.intensity = look.sun;
    this.scene.environmentIntensity = look.env;
    this.groundMaterial?.diffuseColor.copyFrom(look.ground);
    // Nobody drives at night with the lights off.
    if (night && this.vehicle?.getStats(this.driving).headlights === 'off') this.vehicle.setHeadlights('low');
  }

  /** Walks to the door and gets in when close to the car; gets out when driving slowly enough. */
  toggleVehicle() {
    if (this.boarding || !this.vehicle || !this.character) return;
    if (this.driving) {
      if (Math.abs(this.vehicle.getStats(true).speedKmh) / 3.6 <= EXIT_MAX_SPEED) this.exitVehicle();
    } else if (this.isNearVehicle()) {
      this.boarding = { phase: 'toDoor', elapsed: 0 };
    }
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
      boarding: !!this.boarding,
      nearVehicle: !this.driving && !this.boarding && this.isNearVehicle(),
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
      if (this.boarding) {
        this.updateBoarding(vehicle, dt);
        return;
      }
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

  /**
   * Getting in: walk to the driver's door, open it (the "interact" reach-and-pull), turn and sit
   * into the seat, then ride along parented to the car. None of the current models have doors as
   * separate parts, so the door itself doesn't swing; the character's motion sells it. Bikes skip
   * the door. Getting out plays it backwards.
   */
  private updateBoarding(vehicle: SandboxVehicle, dt: number) {
    const character = this.character!;
    const root = character.root;
    const board = this.boarding!;
    const saddle = vehicle.seat.x === 0;
    const door = vehicle.exitPoint();

    if (board.phase === 'toDoor') {
      board.elapsed += dt;
      const to = new Vector3(door.x - root.position.x, 0, door.z - root.position.z);
      const distance = to.length();
      const step = HUMAN_METRICS.walkSpeed * dt;
      if (distance > step && board.elapsed < 4) {
        root.position.addInPlace(to.scale(step / distance));
        root.rotation.y = turnToward(root.rotation.y, Math.atan2(to.x, to.z), dt);
        character.play('walk');
      } else {
        root.position.set(door.x, 0, door.z);
        if (saddle) {
          this.startSitting(vehicle);
        } else {
          this.boarding = { phase: 'opening', left: Math.min(character.duration('interact'), DOOR_OPEN_SECONDS) };
          character.play('interact', { restart: true });
        }
      }
    } else if (board.phase === 'opening') {
      // Face the car side: the door is on the car's left, so look along the car's right.
      const facing = Math.atan2(-Math.cos(door.heading), Math.sin(door.heading));
      root.rotation.y = turnToward(root.rotation.y, facing, dt);
      board.left -= dt;
      if (board.left <= 0) this.startSitting(vehicle);
    } else {
      board.t = Math.min(board.duration, board.t + dt);
      const k = smoothstep(board.t / board.duration);
      if (board.phase === 'sitting') {
        const seat = this.seatWorld(vehicle);
        root.position.copyFrom(Vector3.Lerp(board.from, seat, k));
        root.rotation.y = lerpAngle(board.fromHeading, vehicle.heading, k);
        if (board.t >= board.duration) {
          this.attachDriver(vehicle);
          this.boarding = undefined;
          this.driving = true;
          this.camera.radius = Math.max(this.camera.radius, DRIVING_CAMERA_RADIUS);
        }
      } else {
        root.position.copyFrom(Vector3.Lerp(board.from, new Vector3(door.x, 0, door.z), k));
        if (board.t >= board.duration) {
          this.boarding = undefined;
          this.grounded = true;
          this.velocityY = 0;
          character.play('idle');
        }
      }
    }
    const target = root.getAbsolutePosition().add(new Vector3(0, CAMERA_TARGET_HEIGHT, 0));
    this.camera.target.copyFrom(Vector3.Lerp(this.camera.target, target, 1 - Math.exp(-10 * dt)));
  }

  private startSitting(vehicle: SandboxVehicle) {
    const character = this.character!;
    const duration = Math.min(Math.max(character.duration('sitDown'), 0.6), 1.2);
    this.boarding = {
      phase: 'sitting',
      t: 0,
      duration,
      from: character.root.position.clone(),
      fromHeading: character.root.rotation.y,
    };
    character.play('sitDown', { restart: true, then: 'driving' });
    this.speed = 0;
    // Hold the car still while someone climbs in.
    vehicle.input.throttle = 0;
  }

  /** Where the character's origin goes when seated, in world space. */
  private seatWorld(vehicle: SandboxVehicle): Vector3 {
    return Vector3.TransformCoordinates(this.seatedOrigin(vehicle), vehicle.root!.getWorldMatrix());
  }

  private exitVehicle() {
    if (!this.vehicle || !this.character) return;
    const root = this.character.root;
    this.detachDriver();
    const world = root.position.clone();
    root.rotation.set(0, this.vehicle.heading, 0);
    root.setEnabled(true);
    this.driving = false;
    const duration = Math.min(Math.max(this.character.duration('standUp'), 0.6), 1.2);
    this.boarding = { phase: 'standing', t: 0, duration, from: world, fromHeading: this.vehicle.heading };
    this.character.play('standUp', { restart: true, then: 'idle' });
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

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerpAngle(from: number, to: number, t: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
}

function turnToward(from: number, to: number, dt: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * (1 - Math.exp(-14 * dt));
}

function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
