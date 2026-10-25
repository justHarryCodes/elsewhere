import {
  type AnimationGroup,
  type AssetContainer,
  LoadAssetContainerAsync,
  Quaternion,
  type Scene,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  type City,
  type Pedestrian,
  TRAFFIC_CAR_KINDS,
  type TrafficCar,
  type TrafficOptions,
  TownTraffic,
  VehicleLights,
  type VehicleModelKey,
  vehicleGeometry,
} from '@game/shared';
import { VehicleLibrary, type VehicleVisual } from './vehicles';

// Who walks the streets: the modular characters (they all share one rig and its animations).
const WALKERS = [
  'modular-men/business-man',
  'modular-men/casual-character',
  'modular-men/hoodie-character',
  'modular-men/worker',
  'modular-men/beach-character',
  'modular-men/farmer',
  'modular-men/punk',
  'modular-women/suit',
  'modular-women/worker',
  'modular-women/punk',
  'modular-women/adventurer',
  'singles/animated-woman',
  'singles/animated-woman-2',
];
const PERSON_HEIGHT = 1.75;
const WALK_CLIP = 'CharacterArmature|Walk';
const IDLE_CLIP = 'CharacterArmature|Idle';
/** Speed (m/s) the walk clip moves at, to match feet to the ground. */
const WALK_CLIP_SPEED = 1.35;
const DOG = '/assets/animals/kenney-cube-pets/animal-dog.glb';
const DOG_HEIGHT = 0.55;

interface Walker {
  root: TransformNode;
  walk?: AnimationGroup;
  idle?: AnimationGroup;
  moving?: boolean;
  dog?: { root: TransformNode; walk?: AnimationGroup; idle?: AnimationGroup };
  disposables: { dispose(): void }[];
}

interface Driven {
  visual?: VehicleVisual;
  paint: string;
  disposed?: boolean;
}

/**
 * The town's ambient life, drawn: TownTraffic's cars as real vehicle models (wheels turning, brake
 * lights, headlights at night) and its people as animated characters, some walking a dog. Call update()
 * every frame with the player's position (and anything else cars should stop for).
 */
export class TownLife {
  readonly traffic: TownTraffic;
  private readonly root: TransformNode;
  private readonly vehicles: VehicleLibrary;
  private readonly cars = new Map<number, Driven>();
  private readonly people = new Map<number, Walker>();
  private readonly containers = new Map<string, Promise<{ container: AssetContainer; scale: number }>>();
  private night = false;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    city: City,
    options: TrafficOptions = {},
  ) {
    this.traffic = new TownTraffic(city, options);
    this.root = new TransformNode('town-life', scene);
    this.vehicles = new VehicleLibrary(scene);
  }

  setNight(night: boolean) {
    this.night = night;
  }

  update(dt: number, focus: { x: number; z: number }, obstacles: { x: number; z: number }[] = []) {
    this.traffic.update(Math.min(dt, 0.1), focus, obstacles);
    this.syncCars(dt);
    this.syncPeople();
  }

  // ------------------------------------------------------------------ cars

  private syncCars(dt: number) {
    const live = new Set<number>();
    for (const car of this.traffic.cars) {
      live.add(car.id);
      let drawn = this.cars.get(car.id);
      if (!drawn) {
        const kind = TRAFFIC_CAR_KINDS[car.kind];
        drawn = { paint: kind.paints[car.id % kind.paints.length] };
        this.cars.set(car.id, drawn);
        const entry = drawn;
        void this.vehicles.createVehicle(kind.model as VehicleModelKey, `traffic-${car.id}`).then((visual) => {
          if (entry.disposed || this.disposed) visual.dispose();
          else {
            visual.root.parent = this.root;
            entry.visual = visual;
          }
        });
      }
      if (drawn.visual) this.draw(drawn, car, dt);
    }
    for (const [id, drawn] of this.cars) {
      if (live.has(id)) continue;
      drawn.disposed = true;
      drawn.visual?.dispose();
      this.cars.delete(id);
    }
  }

  private draw(drawn: Driven, car: TrafficCar, dt: number) {
    const visual = drawn.visual!;
    const spin = car.odometer / vehicleGeometry(visual.model).wheelRadius;
    const q = Quaternion.RotationYawPitchRoll(car.heading, 0, 0);
    visual.apply(
      {
        model: visual.model,
        paint: drawn.paint,
        finish: 'gloss',
        x: car.x,
        y: car.y,
        z: car.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
        speed: car.speed,
        steer: car.steer,
        wheelSpin: [spin, spin, spin, spin],
        wheelDrop: [0, 0, 0, 0],
        lights: (this.night ? VehicleLights.Low : 0) | (car.braking ? VehicleLights.Brake : 0),
      },
      dt,
    );
  }

  // ------------------------------------------------------------------ people

  /** A model loaded once, with the scale that makes it `height` metres tall. */
  private model(url: string, height: number) {
    let loading = this.containers.get(url);
    if (!loading) {
      loading = LoadAssetContainerAsync(url, this.scene).then((container) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const mesh of container.meshes) {
          if (!mesh.getTotalVertices()) continue;
          mesh.computeWorldMatrix(true);
          const box = mesh.getBoundingInfo().boundingBox;
          lo = Math.min(lo, box.minimumWorld.y);
          hi = Math.max(hi, box.maximumWorld.y);
        }
        return { container, scale: hi > lo ? height / (hi - lo) : 1 };
      });
      this.containers.set(url, loading);
    }
    return loading;
  }

  private spawn(url: string, height: number, name: string, parent: TransformNode, disposables: { dispose(): void }[]) {
    return this.model(url, height).then(({ container, scale }) => {
      const entries = container.instantiateModelsToScene((source) => `${name}-${source}`, false);
      const holder = new TransformNode(name, this.scene);
      holder.parent = parent;
      holder.scaling.setAll(scale);
      for (const node of entries.rootNodes) node.parent = holder;
      for (const group of entries.animationGroups) group.stop();
      disposables.push(holder, ...entries.animationGroups, ...entries.skeletons);
      const clip = (match: (name: string) => boolean) => entries.animationGroups.find((g) => match(g.name.slice(name.length + 1)));
      return { holder, clip };
    });
  }

  private syncPeople() {
    const live = new Set<number>();
    for (const person of this.traffic.people) {
      live.add(person.id);
      let walker = this.people.get(person.id);
      if (!walker) walker = this.addWalker(person);
      walker.root.position.set(person.x, person.y, person.z);
      walker.root.rotation.y = person.heading;
      const moving = person.speed > 0;
      if (moving !== walker.moving && walker.walk && walker.idle) {
        walker.moving = moving;
        (moving ? walker.idle : walker.walk).stop();
        const clip = moving ? walker.walk : walker.idle;
        clip.start(true, moving ? person.pace / WALK_CLIP_SPEED : 1);
        const dog = walker.dog;
        if (dog?.walk && dog.idle) {
          (moving ? dog.idle : dog.walk).stop();
          (moving ? dog.walk : dog.idle).start(true);
        }
      }
    }
    for (const [id, walker] of this.people) {
      if (live.has(id)) continue;
      for (const d of walker.disposables) d.dispose();
      walker.root.dispose();
      this.people.delete(id);
    }
  }

  private addWalker(person: Pedestrian): Walker {
    const root = new TransformNode(`walker-${person.id}`, this.scene);
    root.parent = this.root;
    const walker: Walker = { root, disposables: [] };
    this.people.set(person.id, walker);
    const look = WALKERS[Math.floor(person.look * WALKERS.length)];
    void this.spawn(`/assets/characters/${look}.glb`, PERSON_HEIGHT, `walker-${person.id}`, root, walker.disposables).then(({ clip }) => {
      walker.walk = clip((n) => n === WALK_CLIP);
      walker.idle = clip((n) => n === IDLE_CLIP) ?? clip((n) => n.endsWith('Idle'));
      walker.moving = undefined; // start the right clip on the next update
    });
    if (person.dog) {
      // On the walker's right, a step ahead, as if on a lead.
      const spot = new TransformNode(`walker-${person.id}-dog`, this.scene);
      spot.parent = root;
      spot.position.set(-0.75, 0, 0.6);
      walker.disposables.push(spot);
      void this.spawn(DOG, DOG_HEIGHT, `dog-${person.id}`, spot, walker.disposables).then(({ holder, clip }) => {
        walker.dog = { root: holder, walk: clip((n) => n === 'walk'), idle: clip((n) => n === 'idle') };
        walker.moving = undefined;
      });
    }
    return walker;
  }

  dispose() {
    this.disposed = true;
    for (const drawn of this.cars.values()) drawn.visual?.dispose();
    for (const walker of this.people.values()) for (const d of walker.disposables) d.dispose();
    this.root.dispose();
    for (const loading of this.containers.values()) void loading.then(({ container }) => container.dispose());
    this.vehicles.dispose();
  }
}
