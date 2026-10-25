import { type MutableRefObject, useEffect, useRef } from "react";
import {
  ArcRotateCamera,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { type City, toHumanAnimation, toHumanBody } from "@game/shared";
import type { PlayersRef } from "../../net/useGameRoom";
import { approachAngle, smoothing } from "../smoothing";
import {
  CAMERA_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_POLAR,
  CAMERA_TARGET_HEIGHT,
} from "../camera";
import type { CameraView } from "../CameraControls";
import { Atmosphere } from "./atmosphere";
import { CityRenderer } from "./city";
import { type HumanCharacter, HumanLibrary } from "./humans";

const CAMERA_ALPHA = Math.PI / 2; // horizontal angle (PI/2 = behind the player, looking toward -Z)
// Distance and angle from straight up for each camera view; "chase" is the game's usual camera.
const VIEWS: Record<CameraView, { radius: number; beta: number }> = {
  street: { radius: 6, beta: 1.35 },
  chase: { radius: CAMERA_DISTANCE, beta: CAMERA_POLAR },
  overhead: { radius: 110, beta: 0.15 },
};

/** Camera moves the page can ask for (buttons), beyond the view and night props. */
export interface SceneControls {
  rotate(radians: number): void;
  zoom(factor: number): void;
}

/** Eases the camera toward a goal set by the view buttons, turns and zooms. */
type CameraGoal = { radius?: number; beta?: number; alpha?: number };

export function BabylonScene({
  players,
  selfId,
  city,
  night,
  view,
  controlsRef,
}: {
  players: PlayersRef;
  selfId?: string;
  city: City;
  night: boolean;
  view: CameraView;
  controlsRef?: MutableRefObject<SceneControls | undefined>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live handles into the running scene, for the night and view props below.
  const sceneRef = useRef<{ atmosphere: Atmosphere; cityRenderer: CityRenderer; goal: (goal: CameraGoal) => void }>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    // Right-handed like glTF and Three.js: +Z faces the camera, +X is screen-right.
    scene.useRightHandedSystem = true;

    const camera = new ArcRotateCamera(
      "camera",
      CAMERA_ALPHA,
      CAMERA_POLAR,
      CAMERA_DISTANCE,
      Vector3.Zero(),
      scene,
    );
    camera.lowerRadiusLimit = CAMERA_MIN_DISTANCE;
    camera.upperRadiusLimit = Math.max(CAMERA_MAX_DISTANCE, VIEWS.overhead.radius);
    // Arrow keys move the player, not the camera.
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.attachControl(canvas, true);
    const hemi = new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
    const atmosphere = new Atmosphere(scene, camera, hemi, sun);

    let library: HumanLibrary | undefined;
    let disposed = false;
    // The same city the server collides against (from the room's seed), built in chunks round the
    // camera as the player moves.
    const cityRenderer = CityRenderer.create(scene, city);

    let goal: CameraGoal | undefined;
    const easeCamera = (dt: number) => {
      if (!goal) return;
      const k = 1 - Math.exp(-6 * dt);
      let done = true;
      for (const key of ["radius", "beta", "alpha"] as const) {
        const to = goal[key];
        if (to === undefined) continue;
        camera[key] += (to - camera[key]) * k;
        done &&= Math.abs(to - camera[key]) < (key === "radius" ? 0.05 : 0.005);
      }
      if (done) goal = undefined;
    };
    sceneRef.current = { atmosphere, cityRenderer, goal: (next) => (goal = { ...goal, ...next }) };
    if (controlsRef) {
      controlsRef.current = {
        rotate: (radians) => (goal = { ...goal, alpha: (goal?.alpha ?? camera.alpha) + radians }),
        zoom: (factor) =>
          (goal = {
            ...goal,
            radius: Math.min(camera.upperRadiusLimit!, Math.max(camera.lowerRadiusLimit!, (goal?.radius ?? camera.radius) * factor)),
          }),
      };
    }

    // Load other models at real-world size with loadRealScale(scene, '/assets/car.glb', 'vehicle.sedan').
    HumanLibrary.load(scene)
      .then((loaded) => {
        if (!disposed) library = loaded;
      })
      .catch((error) => console.error("Failed to load human assets", error));

    // `animation`/`seq` are the last server values applied, so a finished one-shot isn't replayed.
    const humans = new Map<
      string,
      { character: HumanCharacter; animation?: string; seq: number }
    >();
    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime() / 1000;
      cityRenderer.update(camera.target, dt);
      atmosphere.follow(camera.target);
      easeCamera(dt);
      if (!library) return;
      const t = smoothing(engine.getDeltaTime() / 1000);
      // Follow the given player, or the first one in the room if no selfId is passed.
      const followId = selfId ?? players.current.keys().next().value;

      for (const [id, player] of players.current) {
        let human = humans.get(id);
        if (!human) {
          const character = library.createHuman(toHumanBody(player.body), id);
          character.root.position.set(player.x, player.y, player.z);
          character.root.rotation.y = player.heading;
          human = { character, seq: player.animationSeq };
          humans.set(id, human);
        }

        const { root } = human.character;
        root.position.x += (player.x - root.position.x) * t;
        root.position.y += (player.y - root.position.y) * t;
        root.position.z += (player.z - root.position.z) * t;
        root.rotation.y = approachAngle(root.rotation.y, player.heading, t);

        // Move the orbit target onto the player; alpha/beta/radius (and mouse orbit/zoom) are kept.
        if (id === followId) {
          camera.target.set(
            root.position.x,
            root.position.y + CAMERA_TARGET_HEIGHT,
            root.position.z,
          );
        }

        if (
          player.animation !== human.animation ||
          player.animationSeq !== human.seq
        ) {
          human.character.play(toHumanAnimation(player.animation), {
            restart: true,
          });
          human.animation = player.animation;
          human.seq = player.animationSeq;
        }
      }

      for (const [id, human] of humans) {
        if (!players.current.has(id)) {
          human.character.dispose();
          humans.delete(id);
        }
      }
    });

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      sceneRef.current = undefined;
      if (controlsRef) controlsRef.current = undefined;
      cityRenderer.dispose();
      window.removeEventListener("resize", onResize);
      engine.dispose();
    };
    // The view and night props are applied by the effects below, so changing them doesn't rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, selfId, city]);

  useEffect(() => {
    const live = sceneRef.current;
    if (!live) return;
    live.atmosphere.set(night);
    live.cityRenderer.setNight(night);
  }, [night, players, selfId, city]);

  useEffect(() => {
    sceneRef.current?.goal(VIEWS[view]);
  }, [view, players, selfId, city]);

  return (
    <canvas ref={canvasRef} className="block h-full w-full outline-none" />
  );
}
