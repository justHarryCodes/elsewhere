import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { generateCity, toHumanAnimation, toHumanBody } from "@game/shared";
import type { PlayersRef } from "../../net/useGameRoom";
import { approachAngle, smoothing } from "../smoothing";
import {
  CAMERA_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_POLAR,
  CAMERA_TARGET_HEIGHT,
} from "../camera";
import { CityRenderer } from "./city";
import { type HumanCharacter, HumanLibrary } from "./humans";

const CAMERA_AZIMUTH = 0; // horizontal angle (0 = behind the player, on the +Z side looking toward -Z)

export function ThreeScene({
  players,
  selfId,
  citySeed,
}: {
  players: PlayersRef;
  selfId?: string;
  citySeed: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8cb3d9);
    scene.fog = new THREE.FogExp2(0x8cb3d9, 0.0015);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
    camera.position.setFromSphericalCoords(
      CAMERA_DISTANCE,
      CAMERA_POLAR,
      CAMERA_AZIMUTH,
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = CAMERA_MIN_DISTANCE;
    controls.maxDistance = CAMERA_MAX_DISTANCE;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(10, 20, 5);
    scene.add(sun);

    let library: HumanLibrary | undefined;
    let city: CityRenderer | undefined;
    let disposed = false;
    // The same city the server collides against, from the room's seed.
    CityRenderer.create(generateCity({ seed: citySeed }))
      .then((loaded) => {
        if (disposed) return loaded.dispose();
        city = loaded;
        scene.add(loaded.root);
      })
      .catch((error) => console.error("Failed to load the city", error));

    // Load other models with GLTFLoader and scale them with fitScaleFactor() from @game/shared.
    HumanLibrary.load()
      .then((loaded) => {
        if (disposed) loaded.dispose();
        else library = loaded;
      })
      .catch((error) => console.error("Failed to load human assets", error));

    // `animation`/`seq` are the last server values applied, so a finished one-shot isn't replayed.
    const humans = new Map<
      string,
      { character: HumanCharacter; animation?: string; seq: number }
    >();

    const syncPlayers = (dt: number) => {
      if (!library) return;
      const t = smoothing(dt);

      for (const [id, player] of players.current) {
        let human = humans.get(id);
        if (!human) {
          const character = library.createHuman(toHumanBody(player.body));
          character.root.position.set(player.x, player.y, player.z);
          character.root.rotation.y = player.heading;
          scene.add(character.root);
          human = { character, seq: player.animationSeq };
          humans.set(id, human);
        }

        const { root } = human.character;
        root.position.lerp(new THREE.Vector3(player.x, player.y, player.z), t);
        root.rotation.y = approachAngle(root.rotation.y, player.heading, t);

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
        human.character.update(dt);
      }

      for (const [id, human] of humans) {
        if (!players.current.has(id)) {
          human.character.dispose();
          humans.delete(id);
        }
      }
    };

    // Moves the orbit target onto the followed player and shifts the camera by the same amount,
    // so the viewing angle and distance (including mouse orbit/zoom) are preserved.
    const followPlayer = () => {
      // Follow the given player, or the first one in the room if no selfId is passed.
      const followId = selfId ?? players.current.keys().next().value;
      const root =
        followId === undefined
          ? undefined
          : humans.get(followId)?.character.root;
      if (!root) return;
      const target = new THREE.Vector3(
        root.position.x,
        root.position.y + CAMERA_TARGET_HEIGHT,
        root.position.z,
      );
      camera.position.add(target.clone().sub(controls.target));
      controls.target.copy(target);
    };

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      syncPlayers(clock.getDelta());
      followPlayer();
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      humans.forEach((human) => human.character.dispose());
      library?.dispose();
      city?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [players, selfId, citySeed]);

  return <div ref={containerRef} className="h-full w-full" />;
}
