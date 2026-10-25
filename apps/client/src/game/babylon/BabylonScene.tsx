import { useEffect, useRef } from "react";
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { WORLD_HALF_SIZE, toHumanAnimation, toHumanBody } from "@game/shared";
import type { PlayersRef } from "../../net/useGameRoom";
import { approachAngle, smoothing } from "../smoothing";
import { type HumanCharacter, HumanLibrary } from "./humans";

// Camera tuning
const CAMERA_ALPHA = Math.PI / 2; // horizontal angle (PI/2 = behind the player, looking toward -Z)
const CAMERA_BETA = Math.PI / 4; // angle from straight up: PI/4 = 45° overhead
const CAMERA_RADIUS = 20; // distance from the player: bigger = more zoomed out
const CAMERA_MIN_RADIUS = 10; // closest the mouse wheel can zoom
const CAMERA_MAX_RADIUS = 35; // farthest the mouse wheel can zoom
const CAMERA_TARGET_HEIGHT = 1; // aim at chest height instead of the feet (set 0 for feet)

export function BabylonScene({
  players,
  selfId,
}: {
  players: PlayersRef;
  selfId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    // Right-handed like glTF and Three.js: +Z faces the camera, +X is screen-right.
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.03, 0.05, 0.1, 1);

    const camera = new ArcRotateCamera(
      "camera",
      CAMERA_ALPHA,
      CAMERA_BETA,
      CAMERA_RADIUS,
      Vector3.Zero(),
      scene,
    );
    camera.lowerRadiusLimit = CAMERA_MIN_RADIUS;
    camera.upperRadiusLimit = CAMERA_MAX_RADIUS;
    // Arrow keys move the player, not the camera.
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.attachControl(canvas, true);
    new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
    sun.intensity = 1.2;

    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: WORLD_HALF_SIZE * 2 + 2, height: WORLD_HALF_SIZE * 2 + 2 },
      scene,
    );
    const groundMaterial = new StandardMaterial("ground-mat", scene);
    groundMaterial.diffuseColor = new Color3(0.15, 0.2, 0.25);
    ground.material = groundMaterial;

    // Load other models at real-world size with loadRealScale(scene, '/assets/car.glb', 'vehicle.sedan').

    let library: HumanLibrary | undefined;
    let disposed = false;
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
      window.removeEventListener("resize", onResize);
      engine.dispose();
    };
  }, [players, selfId]);

  return (
    <canvas ref={canvasRef} className="block h-full w-full outline-none" />
  );
}
