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
  type CityInterior,
  type InteriorSpot,
  interiorAt,
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
/** A second, calmer idle for people standing about (the Interact and Wave clips tip some of these models over). */
const NEUTRAL_CLIP = 'CharacterArmature|Idle_Neutral';
const DOG = '/assets/animals/kenney-cube-pets/animal-dog.glb';
const DOG_HEIGHT = 0.55;
/** People inside walk at this pace, and there are never more than this many in one building. */
const INDOOR_PACE = 1.15;
const INDOOR_MAX = 26;
/** Homes: nobody else in them. */
const PRIVATE = new Set(['home', 'house', 'apartment']);

/** Someone inside a building: staff at their post, or a visitor going from room to room. */
interface Indoor {
  spot: InteriorSpot;
  root: TransformNode;
  clips: Partial<Record<'walk' | 'idle' | 'neutral', AnimationGroup>>;
  playing?: string;
  x: number;
  z: number;
  heading: number;
  /** Where they're walking (waypoints through doorways), and how long until they do something else. */
  path: { x: number; z: number }[];
  wait: number;
  /** A spell of the calmer idle, and for how long. */
  gesture?: { clip: 'neutral'; time: number };
  disposables: { dispose(): void }[];
}

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
  /** The people inside the building the player is in. */
  private indoor?: { interior: CityInterior; people: Indoor[] };

  constructor(
    private readonly scene: Scene,
    private readonly city: City,
    options: TrafficOptions = {},
  ) {
    this.traffic = new TownTraffic(city, options);
    this.root = new TransformNode('town-life', scene);
    this.vehicles = new VehicleLibrary(scene);
  }

  setNight(night: boolean) {
    this.night = night;
  }

  update(dt: number, focus: { x: number; y?: number; z: number }, obstacles: { x: number; z: number }[] = []) {
    this.traffic.update(Math.min(dt, 0.1), focus, obstacles);
    this.syncCars(dt);
    this.syncPeople();
    this.updateIndoor(Math.min(dt, 0.1), focus);
  }

  // ------------------------------------------------------------------ people inside

  /** Fills the building the player is in with its staff and visitors, and moves them about. */
  private updateIndoor(dt: number, focus: { x: number; y?: number; z: number }) {
    const y = focus.y ?? 0;
    const at = y < -5 ? interiorAt(this.city.interiors, focus.x, y - 1.2, focus.z) : undefined;
    if (this.indoor && this.indoor.interior !== at?.interior) {
      for (const person of this.indoor.people) for (const d of person.disposables) d.dispose();
      this.indoor = undefined;
    }
    if (!at) return;
    if (!this.indoor) {
      // People's homes are their own: nobody wanders about in one uninvited.
      const home = PRIVATE.has(at.interior.kind);
      this.indoor = { interior: at.interior, people: home ? [] : at.interior.spots.slice(0, INDOOR_MAX).map((spot, i) => this.addIndoor(spot, i)) };
    }
    for (const person of this.indoor.people) {
      // Upstairs people go out of sight with their floor.
      person.root.setEnabled(person.spot.level <= at.level);
      this.moveIndoor(person, this.indoor.interior, dt);
    }
  }

  private addIndoor(spot: InteriorSpot, i: number): Indoor {
    const root = new TransformNode(`indoor-${i}`, this.scene);
    root.parent = this.root;
    root.position.set(spot.x, spot.y, spot.z);
    root.rotation.y = spot.heading;
    const person: Indoor = { spot, root, clips: {}, x: spot.x, z: spot.z, heading: spot.heading, path: [], wait: 1 + Math.random() * 6, disposables: [root] };
    const look = WALKERS[Math.floor(Math.random() * WALKERS.length)];
    void this.spawn(`/assets/characters/${look}.glb`, PERSON_HEIGHT, `indoor-${i}`, root, person.disposables).then(({ clip }) => {
      person.clips = {
        walk: clip((n) => n === WALK_CLIP),
        idle: clip((n) => n === IDLE_CLIP) ?? clip((n) => n.endsWith('Idle')),
        neutral: clip((n) => n === NEUTRAL_CLIP),
      };
      person.playing = undefined;
    });
    return person;
  }

  private play(person: Indoor, clip: 'walk' | 'idle' | 'neutral') {
    if (person.playing === clip) return;
    const next = person.clips[clip];
    if (!next) return;
    if (person.playing) person.clips[person.playing as keyof Indoor['clips']]?.stop();
    next.start(true, clip === 'walk' ? INDOOR_PACE / WALK_CLIP_SPEED : 1);
    person.playing = clip;
  }

  private moveIndoor(person: Indoor, interior: CityInterior, dt: number) {
    if (person.gesture) {
      person.gesture.time -= dt;
      this.play(person, person.gesture.clip);
      if (person.gesture.time <= 0) person.gesture = undefined;
      return;
    }
    const target = person.path[0];
    if (target) {
      // Walking to the next waypoint.
      const dx = target.x - person.x;
      const dz = target.z - person.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.15) {
        person.path.shift();
        if (!person.path.length) person.wait = 3 + Math.random() * 8;
      } else {
        const step = Math.min(distance, INDOOR_PACE * dt);
        person.x += (dx / distance) * step;
        person.z += (dz / distance) * step;
        const want = Math.atan2(dx, dz);
        person.heading += Math.atan2(Math.sin(want - person.heading), Math.cos(want - person.heading)) * Math.min(1, dt * 8);
      }
      this.play(person, 'walk');
    } else {
      // Standing about: staff at their post now and then busy with something, visitors off somewhere new.
      person.wait -= dt;
      const settle = Math.atan2(Math.sin(person.spot.heading - person.heading), Math.cos(person.spot.heading - person.heading));
      if (person.spot.role === 'staff') person.heading += settle * Math.min(1, dt * 4);
      this.play(person, 'idle');
      if (person.wait <= 0) {
        person.wait = 4 + Math.random() * 8;
        if (person.spot.role === 'staff' || Math.random() < 0.25) person.gesture = { clip: 'neutral', time: 3 + Math.random() * 4 };
        else person.path = this.route(interior, person);
      }
    }
    person.root.position.set(person.x, person.spot.y, person.z);
    person.root.rotation.y = person.heading;
  }

  /** A walk from where someone is to somewhere in another room on their floor, through the doorways. */
  private route(interior: CityInterior, person: Indoor): { x: number; z: number }[] {
    const level = person.spot.level;
    const inRoom = (i: number, x: number, z: number) => {
      const r = interior.rooms[i];
      return r.level === level && x >= r.x0 - 0.2 && x <= r.x1 + 0.2 && z >= r.z0 - 0.2 && z <= r.z1 + 0.2;
    };
    const start = interior.rooms.findIndex((_, i) => inRoom(i, person.x, person.z));
    if (start < 0) return [];
    const options = interior.rooms.map((r, i) => i).filter((i) => interior.rooms[i].level === level);
    const goal = options[Math.floor(Math.random() * options.length)];
    // Breadth first through the doorways (links between two rooms on this floor).
    const from = new Map<number, { room: number; link: { x: number; z: number } } | null>([[start, null]]);
    const queue = [start];
    while (queue.length && !from.has(goal)) {
      const room = queue.shift()!;
      for (const link of interior.links) {
        if (link.level !== level || link.a < 0 || link.b < 0) continue;
        const next = link.a === room ? link.b : link.b === room ? link.a : -1;
        if (next < 0 || from.has(next)) continue;
        from.set(next, { room, link });
        queue.push(next);
      }
    }
    if (!from.has(goal)) return [];
    const path: { x: number; z: number }[] = [];
    for (let at = goal; from.get(at); at = from.get(at)!.room) path.unshift(from.get(at)!.link);
    // Then somewhere in the room, clear of its walls.
    const r = interior.rooms[goal];
    const inset = Math.min(1.2, (r.x1 - r.x0) / 3, (r.z1 - r.z0) / 3);
    path.push({ x: r.x0 + inset + Math.random() * (r.x1 - r.x0 - 2 * inset), z: r.z0 + inset + Math.random() * (r.z1 - r.z0 - 2 * inset) });
    return path;
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
    for (const person of this.indoor?.people ?? []) for (const d of person.disposables) d.dispose();
    this.root.dispose();
    for (const loading of this.containers.values()) void loading.then(({ container }) => container.dispose());
    this.vehicles.dispose();
  }
}
