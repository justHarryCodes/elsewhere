import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CAMERA_PRESETS,
  type CameraPreset,
  type CarLoop,
  type CarState,
  type HumanAnimation,
  type InteriorNav,
  HUMAN_BODIES,
  type NpcState,
  type PlayerPose,
  type Rect,
  type Waypoint,
  buildDistrict,
  buildLocationInterior,
  buildRooftop,
  ACTION_SECONDS,
  type ActionDef,
  type DoorDef,
  type Interactable,
  doorBlock,
  buildNavGrid,
  findPath,
  type NavGrid,
  interactablesOf,
  pickInteractable,
  closeUpView,
  pullIn,
  ROOF_CAMERA,
  hasRooftop,
  createCars,
  createNpcs,
  createWorldState,
  defaultAppearance,
  districtView,
  easeView,
  hasInterior,
  hashSeed,
  inZone,
  locationById,
  locomotionForSpeed,
  mapScene,
  occluders,
  standHeight,
  stepCars,
  stepNpc,
  stepInside,
  stepPlayer,
  towards,
  worldReducer,
} from '@game/shared';
import { BabylonWorld } from './babylon/BabylonWorld';
import { MapCamera } from './mapCamera';
import type { RendererKind, SceneRenderer, View } from './sceneRenderer';
import { ThreeWorld } from './three/ThreeWorld';
import { ActionSheet, ActivityPill, type SheetOption } from './ui/ActionSheet';
import { EnterButton } from './ui/EnterButton';
import { LocationSheet } from './ui/LocationSheet';
import { NameTags } from './ui/NameTags';
import { SandboxPanel } from './ui/SandboxPanel';

const FADE_MS = 500;
/** A press that moves less than this (CSS px) is a tap, not a drag. */
const TAP_SLOP = 6;
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Everything the walking loop needs for the scene the player is in (a district or an inside). */
interface Walk {
  kind: 'district' | 'interior' | 'roof';
  walkArea: Rect;
  solids: Rect[];
  floorY: number;
  /** The height of what's underfoot (pavement, ground, the inside's floor or the roof deck). */
  surfaceY: (x: number, z: number) => number;
  /** The height of the street under someone walking it (people stay on the street below a roof). */
  streetY: (x: number, z: number) => number;
  /** Inside: furniture (and the dance floor) you can use, and the doors. */
  items?: Interactable[];
  doors?: DoorDef[];
  /** Inside: the door up to the roof (on its floor). */
  upZone?: { x: number; z: number; radius: number; level: number };
  camera: CameraPreset;
  /** Inside: the floors and stairs to walk (the player climbs between floors). */
  nav?: InteriorNav;
  /** The door: Enter outside, the way out inside (null: nowhere to go in). */
  zone: { x: number; z: number; radius: number } | null;
  npcRoutes: Waypoint[][];
  slowZones: Rect[];
  carLoops: CarLoop[];
}

/**
 * The city-explore game: the World Map (tap a place, Go there), the district you travel to (walk
 * around outside it), and its inside (Enter at the door, Leave to come back out). All state is the
 * shared WorldState and shared logic; the renderer (Babylon or Three) only draws, picks and reports bounds.
 * With `sandbox`, a side panel adds quick travel, the player's look and clothes, and animation previews.
 */
export function WorldPage({ sandbox = false }: { sandbox?: boolean }) {
  const [state, dispatch] = useReducer(worldReducer, undefined, () => createWorldState());
  const [kind, setKind] = useState<RendererKind>('babylon');
  const [renderer, setRenderer] = useState<SceneRenderer | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [atDoor, setAtDoor] = useState(false);
  const [atRoofDoor, setAtRoofDoor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [faded, setFaded] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camera = useRef(new MapCamera());
  const pose = useRef<PlayerPose>({ x: 0, z: 0, rotY: 0, speed: 0 });
  const npcs = useRef<NpcState[]>([]);
  const cars = useRef<CarState[]>([]);
  /** What was tapped (its actions in the sheet), and the action under way. */
  const [sheet, setSheet] = useState<{ title: string; options: SheetOption[]; pick: (id: string) => void } | null>(null);
  const [acting, setActing] = useState<{ label: string; icon: string; endsAt: number } | null>(null);
  const stopActing = useRef<() => void>(() => {});
  /** A short message ("Can't reach that"), cleared after a moment. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Whether there's a keyboard and mouse (not a touch screen): the hints mention keys only then. */
  const keyboard = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches, []);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(id);
  }, [notice]);
  /** The camera: the overview over the place, or a close-up behind the player (kept across scenes). */
  const [closeUp, setCloseUp] = useState(false);
  const closeRef = useRef(closeUp);
  closeRef.current = closeUp;
  /** Where the close-up stands round the player (radians). */
  const orbit = useRef(0);
  /** Inside: the floor the player counts as on, and their height (on stairs too). */
  const floor = useRef({ level: 0, y: 0 });
  /** Sandbox: an animation to play while the player stands still. */
  const [preview, setPreview] = useState<HumanAnimation | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  /** The look the renderer's player was last made with (a change makes a new one). */
  const spawnedLook = useRef<{ body: string; appearance: unknown }>({ body: '', appearance: undefined });
  const onMap = state.scene.kind === 'map';
  const sceneKey =
    state.scene.kind === 'map' ? 'map' : `${state.scene.kind}:${state.scene.locationId}:${state.scene.kind === 'interior' ? (state.scene.from ?? 'door') : ''}`;
  const selected = state.selectedId ? locationById(state.selectedId) : undefined;
  const here = state.scene.kind === 'map' ? undefined : locationById(state.scene.locationId);

  // Dev only: a handle for poking at the live world from the console (and headless tests).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __world?: unknown }).__world = { renderer, state, dispatch, pose, floor, npcs, cars, walk };
  });

  // One renderer per kind, on a fresh canvas.
  useEffect(() => {
    const r: SceneRenderer = kind === 'babylon' ? new BabylonWorld(canvasRef.current!) : new ThreeWorld(canvasRef.current!);
    setRenderer(r);
    return () => {
      setRenderer(null);
      r.dispose();
    };
  }, [kind]);

  // Load the current scene (with the player and the street's life), then fade in.
  useEffect(() => {
    if (!renderer) return;
    let alive = true;
    setLoading(true);
    setAtDoor(false);
    setAtRoofDoor(false);
    const ready = (async (): Promise<Walk | null> => {
      if (!here) {
        await renderer.loadScene(mapScene());
        if (alive) renderer.setPlayer(null);
        return null;
      }
      if (state.scene.kind === 'interior') {
        const inside = buildLocationInterior(here);
        if (!inside) return null;
        const preset = { ...CAMERA_PRESETS.inside };
        await renderer.loadScene({
          id: `inside-${here.id}`,
          placements: [],
          view: districtView(preset, inside.entry, inside.floorY),
          lighting: { mood: 'day', lamps: [] },
          // The dark round the rooms (no sky over an inside, whatever the camera sees past the walls).
          background: '#1b1e26',
          rooms: inside.city,
          doors: inside.doors,
        });
        // A newer scene may have started loading meanwhile: then this one must not touch the player.
        if (!alive) return null;
        spawnedLook.current = { body: state.player.body, appearance: state.player.appearance };
        await renderer.spawnPlayer(state.player.body, state.player.appearance);
        // In at the front door, or down from the roof at the top floor's roof door.
        const down = state.scene.from === 'roof' ? inside.roofDoor : undefined;
        const at = down ?? { ...inside.entry, level: 0 };
        pose.current = { x: at.x, z: at.z, rotY: at.heading, speed: 0 };
        floor.current = { level: at.level, y: at.y };
        npcs.current = [];
        cars.current = [];
        return {
          kind: 'interior', walkArea: inside.nav.floors[0].rooms[0], solids: [], floorY: inside.floorY, surfaceY: () => floor.current.y, camera: preset,
          nav: inside.nav,
          streetY: () => 0,
          upZone: inside.roofDoor && hasRooftop(here) ? inside.roofDoor : undefined,
          items: interactablesOf(inside.interior),
          doors: inside.doors,
          zone: inside.exitZone, npcRoutes: [], slowZones: [], carLoops: [],
        };
      }
      if (state.scene.kind === 'roof') {
        const roof = buildRooftop(here);
        if (!roof) return null;
        await renderer.loadScene(roof.scene);
        if (!alive) return null;
        spawnedLook.current = { body: state.player.body, appearance: state.player.appearance };
        await renderer.spawnPlayer(state.player.body, state.player.appearance);
        pose.current = { x: roof.door.x, z: roof.door.z, rotY: roof.door.heading, speed: 0 };
        floor.current = { level: 0, y: roof.y };
        // The street carries on below.
        npcs.current = createNpcs(here.district.npcCount, roof.district.npcRoutes, hashSeed(here.id));
        cars.current = createCars(here.district.carLoops);
        await Promise.all([
          ...npcs.current.map((n) => renderer.spawnNpc(n.id, n.body, n.appearance)),
          ...cars.current.map((c) => renderer.spawnCar(c.id, c.asset)),
        ]);
        return {
          kind: 'roof', walkArea: roof.deck, solids: roof.solids, floorY: roof.y, surfaceY: () => roof.y,
          streetY: (x, z) => standHeight(roof.district.raised, x, z), camera: ROOF_CAMERA, zone: roof.doorZone,
          npcRoutes: roof.district.npcRoutes, slowZones: roof.district.slowZones, carLoops: here.district.carLoops,
        };
      }
      const build = buildDistrict(here);
      await renderer.loadScene(build.scene);
      if (!alive) return null;
      spawnedLook.current = { body: state.player.body, appearance: state.player.appearance };
      await renderer.spawnPlayer(state.player.body, state.player.appearance);
      const at = state.player.position ?? here.district.spawn;
      pose.current = { x: at.x, z: at.z, rotY: at.rotY, speed: 0 };
      floor.current = { level: 0, y: 0 };
      // The street's life, from the place's data: who walks where, how many cars.
      npcs.current = createNpcs(here.district.npcCount, build.npcRoutes, hashSeed(here.id));
      cars.current = createCars(here.district.carLoops);
      await Promise.all([
        ...npcs.current.map((n) => renderer.spawnNpc(n.id, n.body, n.appearance)),
        ...cars.current.map((c) => renderer.spawnCar(c.id, c.asset)),
      ]);
      return {
        kind: 'district',
        walkArea: build.walkArea,
        solids: renderer.boxes('solid').map((b) => ({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z })),
        floorY: 0,
        surfaceY: (x, z) => standHeight(build.raised, x, z),
        streetY: (x, z) => standHeight(build.raised, x, z),
        camera: here.district.camera,
        zone: hasInterior(here) ? here.district.doorZone : null,
        npcRoutes: build.npcRoutes,
        slowZones: build.slowZones,
        carLoops: here.district.carLoops,
      };
    })();
    ready.then((w) => {
      if (!alive) return;
      setWalk(w);
      setLoading(false);
      setFaded(false);
    });
    return () => {
      alive = false;
    };
    // The scene key covers the scene; state objects change identity on every dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, sceneKey]);

  // A new look (sandbox): remake the player in place.
  useEffect(() => {
    if (!renderer || !walk || loading) return;
    const { body, appearance } = state.player;
    if (spawnedLook.current.body === body && spawnedLook.current.appearance === appearance) return;
    spawnedLook.current = { body, appearance };
    void renderer.spawnPlayer(body, appearance);
  }, [renderer, walk, loading, state.player]);

  // The map camera, eased every frame.
  useEffect(() => {
    if (!renderer || !onMap || loading) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      camera.current.update(Math.min(0.1, (now - last) / 1000));
      last = now;
      renderer.setView(camera.current.view());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [renderer, onMap, loading]);

  // Highlight and glide to the selected building.
  useEffect(() => {
    if (!renderer || !onMap || loading) return;
    renderer.highlight(selected?.id ?? null, selected?.tagColor);
    if (selected) camera.current.focus(selected.mapPos.x, selected.mapPos.z);
  }, [renderer, onMap, loading, selected]);

  // Pointer input on the map: drag pans, pinch and wheel zoom, a tap picks.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderer || !onMap) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(canvas, e));
      if (pointers.size === 1) moved = 0;
      if (pointers.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      const now = local(canvas, e);
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        moved += Math.hypot(now.x - before.x, now.y - before.y);
        if (moved > TAP_SLOP) camera.current.pan(now.x - before.x, now.y - before.y, canvas.clientHeight, canvas.clientWidth);
      } else if (pointers.size === 2) {
        const d = spread();
        if (pinch > 0 && d > 0) camera.current.zoom(pinch / d);
        pinch = d;
        moved = Infinity;
      }
    };
    const up = (e: PointerEvent) => {
      const at = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (at && pointers.size === 0 && moved <= TAP_SLOP) dispatch({ type: 'select', id: renderer.pick(at.x, at.y) });
      if (pointers.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.current.zoom(Math.exp(e.deltaY * 0.0012));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [renderer, onMap]);

  /** Fade to black, change scene (the load effect fades back in). */
  const travel = (change: () => void) => {
    setFaded(true);
    window.setTimeout(change, FADE_MS);
  };
  const enter = () => travel(() => dispatch({ type: 'enter' }));
  /** The overview, or the close-up (which starts behind the player). */
  const chooseCamera = (close: boolean) => {
    if (close && !closeUp) orbit.current = pose.current.rotY + Math.PI;
    setCloseUp(close);
  };
  const goUp = () => travel(() => dispatch({ type: 'goUp' }));
  const goDown = () => travel(() => dispatch({ type: 'goDown' }));
  const leave = () => travel(() => dispatch({ type: 'leave' }));
  const backToMap = () =>
    travel(() => {
      // Remember where the player stood, for the next visit to this street.
      dispatch({ type: 'setPlayer', player: { position: { x: pose.current.x, z: pose.current.z, rotY: pose.current.rotY } } });
      dispatch({ type: 'backToMap' });
    });

  // Walking a district or an inside: keys or tap-to-walk move the player, the camera follows its
  // preset, buildings between the camera and the player fade, life moves, and the door zone shows Enter.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderer || !walk || !here || loading) return;
    const fading = walk.kind === 'interior' ? [] : renderer.boxes('occluder');
    // What the close-up keeps out of: buildings, trees and street furniture (inside, the cut-away walls).
    const blocking = walk.kind === 'interior' ? [] : renderer.boxes('solid');
    const held = new Set<string>();
    let target: { x: number; z: number } | null = null;
    let view: View = districtView(walk.camera, pose.current, walk.floorY);
    let door = false;
    let roofDoor = false;

    // Doors start open; each eases toward where it was last sent.
    const doorOpen = new Map((walk.doors ?? []).map((d) => [d.id, { now: 1, goal: 1 }]));
    for (const d of walk.doors ?? []) renderer.setDoor(d.id, 1);
    // A door is tapped by its doorway.
    const doorItems: Interactable[] = (walk.doors ?? []).map((d) => {
      const half = d.width / 2;
      const [hx, hz] = d.along === 'x' ? [half, 0.25] : [0.25, half];
      return { id: d.id, name: 'Door', level: d.level, box: { min: { x: d.x - hx, y: d.y, z: d.z - hz }, max: { x: d.x + hx, y: d.y + 2.1, z: d.z + hz } }, actions: [] };
    });
    // The club keeps its lights going over the dance floor.
    const floorLights = walk.items?.find((i) => i.id === 'dance-floor')?.actions[0]?.effects ?? [];
    if (floorLights.length) renderer.playEffects('ambient', floorLights);

    // Finding the way inside: a walking grid per floor, rebuilt when a door opens or shuts.
    const grids = new Map<string, NavGrid>();
    const gridFor = (level: number) => {
      if (!walk.nav) return undefined;
      const shutHere = (walk.doors ?? []).filter((d) => d.level === level && (doorOpen.get(d.id)?.goal ?? 1) < 0.5);
      const key = `${level}:${shutHere.map((d) => d.id).join(',')}`;
      let grid = grids.get(key);
      if (!grid) {
        grid = buildNavGrid(walk.nav, level, shutHere.map(doorBlock));
        grids.set(key, grid);
      }
      return grid;
    };
    /** Inside: the legs still to walk (round furniture, through doorways). */
    let route: { x: number; z: number }[] = [];

    // Using something: find a clear spot by it that can be walked to (a seat from the front if it can,
    // else its side or back), walk there, slide into the pose, hold it for ACTION_SECONDS, then slide
    // back out onto that same clear spot, so nobody is ever left standing inside the furniture.
    const SETTLE = 0.45;
    let activity: {
      action: ActionDef;
      phase: 'walking' | 'settling' | 'acting' | 'leaving';
      spot: { x: number; z: number };
      t: number;
      stalled: number;
      replanned: boolean;
      until: number;
    } | null = null;
    const finish = () => {
      if (!activity) return;
      renderer.stopEffects('action');
      setActing(null);
      if (activity.phase === 'settling' || activity.phase === 'acting') {
        activity.phase = 'leaving';
        activity.t = 0;
      } else {
        activity = null;
        route = [];
      }
    };
    stopActing.current = finish;
    const planTo = (spots: readonly { x: number; z: number }[]) => {
      const grid = gridFor(floor.current.level);
      for (const spot of spots) {
        const path = grid ? findPath(grid, pose.current, spot) : [spot];
        if (path) return path;
      }
      return null;
    };
    const begin = (action: ActionDef) => {
      if (activity && activity.phase !== 'walking') return;
      const path = planTo(action.approaches);
      if (!path) {
        setNotice("Can't reach that from here");
        return;
      }
      route = path;
      target = null;
      activity = { action, phase: 'walking', spot: path[path.length - 1], t: 0, stalled: 0, replanned: false, until: 0 };
    };

    const keyDown = (e: KeyboardEvent) => {
      if (!(e.code in KEYS)) return;
      held.add(e.code);
      target = null;
      route = [];
      // Moving off cancels what you were doing.
      finish();
      setSheet(null);
      e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => held.delete(e.code);
    // A tap walks there (or goes in, tapping the building at its door); in the close-up, a drag turns
    // the camera round the player.
    let press: { x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => {
      press = { ...local(canvas, e), moved: 0 };
    };
    const drag = (e: PointerEvent) => {
      if (!press) return;
      const at = local(canvas, e);
      const dx = at.x - press.x;
      press = { ...at, moved: press.moved + Math.hypot(dx, at.y - press.y) };
      if (closeRef.current && press.moved > TAP_SLOP) orbit.current -= dx * 0.008;
    };
    const tap = (e: PointerEvent) => {
      const wasDrag = !press || press.moved > TAP_SLOP;
      press = null;
      if (wasDrag) return;
      const at = local(canvas, e);
      // At the door, tapping the building goes in too.
      if (walk.kind === 'district' && door && renderer.pick(at.x, at.y) === here.id) return enter();
      // Inside, tapping furniture (or a door) offers what you can do with it.
      if (walk.items) {
        const ray = renderer.ray(at.x, at.y);
        const item = pickInteractable([...walk.items, ...doorItems], floor.current.level, ray.origin, ray.dir);
        const swing = item && doorOpen.get(item.id);
        if (item && swing) {
          setSheet({
            title: 'Door',
            options: [{ id: 'toggle', label: swing.goal > 0.5 ? 'Close the door' : 'Open the door', icon: '🚪' }],
            pick: () => {
              swing.goal = swing.goal > 0.5 ? 0 : 1;
              setSheet(null);
            },
          });
          return;
        }
        if (item) {
          setSheet({
            title: item.name,
            options: item.actions.map(({ id, label, icon }) => ({ id, label, icon })),
            pick: (id) => {
              setSheet(null);
              const action = item.actions.find((a) => a.id === id);
              if (action) begin(action);
            },
          });
          return;
        }
      }
      setSheet(null);
      finish();
      if (activity) return;
      const point = renderer.groundPoint(at.x, at.y, walk.nav ? walk.nav.floors[floor.current.level].y : walk.floorY);
      if (!point) return;
      // Inside, walk round things to get there; outside, straight there.
      const grid = gridFor(floor.current.level);
      if (grid) route = findPath(grid, pose.current, point) ?? [point];
      else target = point;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', drag);
    canvas.addEventListener('pointerup', tap);
    // The close-up starts behind the player.
    orbit.current = pose.current.rotY + Math.PI;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Keys steer relative to the camera (the overview's, or the close-up's round the player): up is
      // away from it.
      const close = closeRef.current;
      const yaw = close ? orbit.current : (walk.camera.yawDeg * Math.PI) / 180;
      let ix = 0;
      let iz = 0;
      for (const code of held) {
        ix += KEYS[code][0];
        iz += KEYS[code][1];
      }
      // Doors swing; shut ones on this floor block the way.
      for (const [id, d] of doorOpen) {
        if (d.now === d.goal) continue;
        d.now += Math.sign(d.goal - d.now) * Math.min(Math.abs(d.goal - d.now), dt * 2.5);
        renderer.setDoor(id, d.now);
      }
      if (walk.doors?.length) renderer.setFloor(floor.current.level);
      const shut = (walk.doors ?? []).filter((d) => d.level === floor.current.level && (doorOpen.get(d.id)?.now ?? 1) < 0.5).map(doorBlock);
      // Along the route, leg by leg (full pace until the last leg, easing in at the end).
      while (route.length > 1 && Math.hypot(route[0].x - pose.current.x, route[0].z - pose.current.z) < 0.25) route.shift();
      // (The last leg eases in and stops a quarter metre short: that's arrived.)
      if (route.length === 1 && Math.hypot(route[0].x - pose.current.x, route[0].z - pose.current.z) < 0.3) route = [];
      const leg = route[0];
      const toward = (p: { x: number; z: number }) => {
        const d = Math.max(1e-6, Math.hypot(p.x - pose.current.x, p.z - pose.current.z));
        return { x: (p.x - pose.current.x) / d, z: (p.z - pose.current.z) / d };
      };
      const move =
        ix || iz
          ? { x: ix * Math.cos(yaw) - iz * Math.sin(yaw), z: -ix * Math.sin(yaw) - iz * Math.cos(yaw) }
          : leg
            ? route.length > 1
              ? toward(leg)
              : towards(pose.current, leg)
            : target
              ? towards(pose.current, target)
              : { x: 0, z: 0 };
      if (activity && activity.phase !== 'walking') {
        // Sliding in, settled, or sliding out: the pose is set below.
        pose.current = { ...pose.current, speed: 0 };
      } else if (walk.nav) {
        const next = stepInside(walk.nav, { ...pose.current, ...floor.current }, move, dt, shut);
        pose.current = next;
        floor.current = { level: next.level, y: next.y };
      } else {
        pose.current = stepPlayer(pose.current, move, dt, walk.walkArea, walk.solids);
      }
      // The camera rides at the player's floor (inside, their height on the stairs).
      const eye = walk.nav ? floor.current.y : walk.floorY;
      if (target && pose.current.speed === 0) target = null;
      if (activity?.phase === 'walking') {
        const a = activity;
        a.stalled = pose.current.speed < 0.05 ? a.stalled + dt : 0;
        if (Math.hypot(pose.current.x - a.spot.x, pose.current.z - a.spot.z) < 0.32) {
          route = [];
          // At the spot: turn and slide into the pose.
          a.phase = 'settling';
          a.t = 0;
          a.spot = { x: pose.current.x, z: pose.current.z };
        } else if (a.stalled > 1) {
          // Held up (a door shut on the way?): find another way once, then give up.
          const path = a.replanned ? null : planTo([a.spot]);
          a.replanned = true;
          a.stalled = 0;
          if (path) route = path;
          else {
            activity = null;
            route = [];
            setNotice("Can't reach that from here");
          }
        }
      }
      if (activity && activity.phase !== 'walking') {
        const a = activity;
        const to = a.action.pose;
        const floorY = walk.surfaceY(a.spot.x, a.spot.z);
        if (a.phase === 'acting' && now >= a.until) finish();
        if (a.phase === 'settling' || a.phase === 'leaving') a.t = Math.min(1, a.t + dt / SETTLE);
        // 0 at the clear spot, 1 in the pose.
        const k = a.phase === 'settling' ? ease(a.t) : a.phase === 'leaving' ? 1 - ease(a.t) : 1;
        const heading = a.phase === 'settling' ? lerpAngle(pose.current.rotY, to.heading, Math.min(1, dt * 10)) : to.heading;
        const x = a.spot.x + (to.x - a.spot.x) * k;
        const z = a.spot.z + (to.z - a.spot.z) * k;
        pose.current = { x, z, rotY: heading, speed: 0 };
        renderer.setPlayer({ x, y: floorY + (to.y - floorY) * k, z, rotY: heading, animation: a.phase === 'leaving' ? 'idle' : a.action.clip });
        if (a.phase === 'settling' && a.t >= 1) {
          a.phase = 'acting';
          a.until = now + ACTION_SECONDS * 1000;
          renderer.playEffects('action', floorLights.length ? a.action.effects.filter((e) => e.kind !== 'club') : a.action.effects);
          setActing({ label: a.action.label, icon: a.action.icon, endsAt: a.until });
        } else if (a.phase === 'leaving' && a.t >= 1) {
          pose.current = { x: a.spot.x, z: a.spot.z, rotY: heading, speed: 0 };
          activity = null;
        }
      } else {
        const still = pose.current.speed === 0;
        renderer.setPlayer({ ...pose.current, animation: still && previewRef.current ? previewRef.current : locomotionForSpeed(pose.current.speed), y: walk.surfaceY(pose.current.x, pose.current.z) });
      }
      npcs.current = npcs.current.map((n) => stepNpc(n, walk.npcRoutes, dt, pose.current));
      for (const n of npcs.current) renderer.setNpc(n.id, { ...n, y: walk.streetY(n.x, n.z), animation: locomotionForSpeed(n.speed) });
      cars.current = stepCars(cars.current, walk.carLoops, dt, walk.slowZones);
      for (const c of cars.current) renderer.setCar(c.id, c);
      // The close-up swings round behind the player as they walk on (not when they back toward it).
      if (close && pose.current.speed > 0) {
        const ahead = -(move.x * Math.sin(yaw) + move.z * Math.cos(yaw)) / Math.max(1e-6, Math.hypot(move.x, move.z));
        if (ahead > 0.3) {
          const behind = pose.current.rotY + Math.PI;
          const turn = Math.atan2(Math.sin(behind - orbit.current), Math.cos(behind - orbit.current));
          orbit.current += turn * (1 - Math.exp(-1.6 * dt));
        }
      }
      const goal = close
        ? pullIn(closeUpView(pose.current, orbit.current, eye, walk.kind === 'interior'), blocking)
        : districtView(walk.camera, pose.current, eye);
      view = easeView(view, goal, dt);
      renderer.setView(view);
      if (fading.length) renderer.setFaded(occluders(view, pose.current, fading));
      const nowAtDoor = !!walk.zone && floor.current.level === 0 && inZone(pose.current.x, pose.current.z, walk.zone);
      if (nowAtDoor !== door) {
        door = nowAtDoor;
        setAtDoor(door);
      }
      const up = walk.upZone;
      const nowAtRoofDoor = !!up && floor.current.level === up.level && inZone(pose.current.x, pose.current.z, up);
      if (nowAtRoofDoor !== roofDoor) {
        roofDoor = nowAtRoofDoor;
        setAtRoofDoor(roofDoor);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      renderer.stopEffects('action');
      renderer.stopEffects('ambient');
      setActing(null);
      setSheet(null);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', drag);
      canvas.removeEventListener('pointerup', tap);
    };
    // enter() only dispatches; a fresh copy each render changes nothing it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, walk, here, loading]);

  const club = state.scene.kind === 'district' && here?.district.mood === 'club';
  const inside = state.scene.kind === 'interior';
  const onRoof = state.scene.kind === 'roof';

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black text-slate-100 select-none">
      <canvas key={kind} ref={canvasRef} className="h-full w-full touch-none outline-none" />
      {onMap && !loading && <NameTags renderer={renderer} selectedId={state.selectedId} />}
      {/* The club's slight vignette: the street's edges sink into the night. */}
      {club && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,0,25,0.6)_100%)]" />}

      {sandbox && (
        <SandboxPanel
          state={state}
          pose={pose}
          animation={preview}
          onAnimation={setPreview}
          closeUp={closeUp}
          onCamera={chooseCamera}
          renderer={kind}
          onRenderer={setKind}
          onTravel={(locationId) => travel(() => dispatch({ type: 'travel', locationId }))}
          onBody={(body) => {
            // Switching between male and female bodies resets the hair and beard to suit; the rest carries over.
            const look = state.player.appearance ?? defaultAppearance(state.player.body);
            const sameBase = HUMAN_BODIES[body].base === HUMAN_BODIES[state.player.body].base;
            const appearance = sameBase ? look : { ...look, hair: defaultAppearance(body).hair, beard: false };
            dispatch({ type: 'setPlayer', player: { body, appearance } });
          }}
          onAppearance={(appearance) => dispatch({ type: 'setPlayer', player: { appearance } })}
        />
      )}

      {/* The renderer switch is a developer tool: kept off phones (the sandbox panel has it too). */}
      <div className={`absolute top-3 hidden items-center gap-1 rounded-lg bg-slate-900/80 p-1 text-xs md:flex ${sandbox ? 'right-3' : 'left-3'}`}>
        {(['babylon', 'three'] as RendererKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-2 py-1 ${kind === k ? 'bg-indigo-600' : 'hover:bg-slate-700'}`}
          >
            {k === 'babylon' ? 'Babylon' : 'Three.js'}
          </button>
        ))}
      </div>

      {onMap && selected && !faded && (
        <LocationSheet
          location={selected}
          onClose={() => dispatch({ type: 'select', id: null })}
          onGo={() => travel(() => dispatch({ type: 'travel', locationId: selected.id }))}
        />
      )}

      {here && !onMap && !faded && (
        <>
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <div className="rounded-full px-3 py-1 text-sm font-semibold shadow" style={{ backgroundColor: here.tagColor, color: '#111827' }}>
              {inside ? `Inside ${here.name}` : onRoof ? `${here.name} · roof terrace` : here.name}
            </div>
          </div>
          {/* In the sandbox, clear of its side panel. */}
          <div className={`absolute bottom-3 left-3 flex flex-col items-start gap-2 ${sandbox ? 'md:left-[calc(20rem_+_0.75rem)]' : ''}`}>
            <div className="flex rounded-lg bg-slate-900/85 p-1 text-xs shadow" role="group" aria-label="Camera">
              {([false, true] as const).map((close) => (
                <button
                  key={String(close)}
                  type="button"
                  onClick={(e) => {
                    chooseCamera(close);
                    e.currentTarget.blur();
                  }}
                  className={`rounded-md px-2.5 py-1 ${closeUp === close ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {close ? 'Close-up' : 'Overview'}
                </button>
              ))}
            </div>
            <div className="rounded-md bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
              {closeUp ? 'Tap to walk · drag to look round' : 'Tap the floor to walk'}
              {keyboard && ' · WASD / arrows'}
            </div>
          </div>
          {inside ? (
            <button
              type="button"
              onClick={leave}
              className="absolute right-3 bottom-3 rounded-xl bg-slate-900/90 px-4 py-2.5 font-semibold shadow-lg ring-1 ring-white/10 hover:bg-slate-800"
            >
              ← Leave
            </button>
          ) : (
            <button
              type="button"
              onClick={backToMap}
              className="absolute right-3 bottom-3 rounded-xl bg-slate-900/90 px-4 py-2.5 font-semibold shadow-lg ring-1 ring-white/10 hover:bg-slate-800"
            >
              ← Back to map
            </button>
          )}
          {atDoor && !inside && !onRoof && <EnterButton label={`Enter ${here.name}`} color={here.tagColor} onPress={enter} />}
          {atDoor && inside && <EnterButton label="Go outside" color={here.tagColor} onPress={leave} />}
          {atRoofDoor && inside && <EnterButton label="Go up to the roof" color={here.tagColor} onPress={goUp} />}
          {atDoor && onRoof && <EnterButton label="Go downstairs" color={here.tagColor} onPress={goDown} />}
        </>
      )}

      {!onMap && !faded && (
        <ActionSheet title={sheet?.title ?? null} options={sheet?.options ?? []} onPick={(id) => sheet?.pick(id)} onClose={() => setSheet(null)} />
      )}
      {notice && !faded && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-3">
          <div className="rounded-full bg-slate-900/90 px-4 py-1.5 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">{notice}</div>
        </div>
      )}
      {acting && !faded && <ActivityPill label={acting.label} icon={acting.icon} endsAt={acting.endsAt} onStop={() => stopActing.current()} />}

      {/* The travel fade: black over everything while a scene changes. */}
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity ease-in-out"
        style={{ opacity: faded ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      />
    </div>
  );
}

function local(canvas: HTMLCanvasElement, e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

const ease = (t: number) => t * t * (3 - 2 * t);

function lerpAngle(from: number, to: number, t: number) {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * t;
}
