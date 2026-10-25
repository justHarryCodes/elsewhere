import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
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
  type HumanAnimation,
  type HumanBody,
  type SizeKey,
} from '@game/shared';
import { type HumanCharacter, HumanLibrary } from '../game/babylon/humans';
import { measureNode } from '../game/babylon/realScale';

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
const GROUND_SIZE = 60;
const CAMERA_TARGET_HEIGHT = 1.1;

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

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.7;
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, -0.6), this.scene);
    sun.position = new Vector3(20, 40, 30);
    sun.intensity = 1.6;
    this.shadows = new ShadowGenerator(2048, sun);
    this.shadows.useBlurExponentialShadowMap = true;

    this.createGround();
    this.createReferences();

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
    this.character.root.position.set(0, 0, 0);
    this.velocityY = 0;
    this.grounded = true;
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
    };
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
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
      if (!event.repeat) this.jump();
      return;
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
    material.diffuseColor = new Color3(0.42, 0.5, 0.42);
    material.specularColor = Color3.Black();
    ground.material = material;
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

function turnToward(from: number, to: number, dt: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * (1 - Math.exp(-14 * dt));
}

function isTyping(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
