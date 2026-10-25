import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { WORLD_HALF_SIZE, toHumanAnimation, toHumanBody } from "@game/shared";
import type { PlayersRef } from "../../net/useGameRoom";
import { approachAngle, smoothing } from "../smoothing";
import { type HumanCharacter, HumanLibrary } from "./humans";

// Camera tuning
const CAMERA_AZIMUTH = 0; // horizontal angle (0 = behind the player, on the +Z side looking toward -Z)
const CAMERA_POLAR = Math.PI / 4; // angle from straight up: PI/4 = 45° overhead
const CAMERA_DISTANCE = 20; // distance from the player: bigger = more zoomed out
const CAMERA_MIN_DISTANCE = 10; // closest the mouse wheel can zoom
const CAMERA_MAX_DISTANCE = 35; // farthest the mouse wheel can zoom
const CAMERA_TARGET_HEIGHT = 1; // aim at chest height instead of the feet (set 0 for feet)

export function ThreeScene({
  players,
  selfId,
}: {
  players: PlayersRef;
  selfId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d1a);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
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

    const groundSize = WORLD_HALF_SIZE * 2 + 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ color: 0x26333f }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Load other models with GLTFLoader and scale them with fitScaleFactor() from @game/shared.

    let library: HumanLibrary | undefined;
    let disposed = false;
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
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [players, selfId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
