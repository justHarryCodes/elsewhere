import { useCallback, useMemo, useRef, useState } from "react";
import { generateCity } from "@game/shared";
import { BabylonScene, type SceneControls } from "./game/babylon/BabylonScene";
import { type CameraView, CameraControls } from "./game/CameraControls";
import { CityMap } from "./game/CityMap";
import { ThreeScene } from "./game/three/ThreeScene";
import { ACTION_HOTKEYS, useActionHotkeys } from "./game/useActionHotkeys";
import { useKeyboardInput } from "./game/useKeyboardInput";
import { useGameRoom } from "./net/useGameRoom";

type Renderer = "babylon" | "three";

export function App() {
  const [renderer, setRenderer] = useState<Renderer>("babylon");
  const { status, players, playerIds, sessionId, citySeed, sendInput, sendAction, sendTeleport } =
    useGameRoom();
  useKeyboardInput(sendInput);
  useActionHotkeys(sendAction);
  // Everyone builds the same city from the room's seed.
  const city = useMemo(() => (citySeed === undefined ? undefined : generateCity({ seed: citySeed })), [citySeed]);
  const [night, setNight] = useState(false);
  const [view, setView] = useState<CameraView>("chase");
  const [mapOpen, setMapOpen] = useState(false);
  const controls = useRef<SceneControls>(undefined);
  const me = useCallback(() => {
    const player = sessionId ? players.current.get(sessionId) : undefined;
    return player && { x: player.x, z: player.z, heading: player.heading };
  }, [players, sessionId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {!city ? null : renderer === "babylon" ? (
        <BabylonScene players={players} selfId={sessionId} city={city} night={night} view={view} controlsRef={controls} />
      ) : (
        <ThreeScene players={players} selfId={sessionId} city={city} />
      )}
      {mapOpen && city && (
        <CityMap city={city} player={me} onNavigate={sendTeleport} onClose={() => setMapOpen(false)} />
      )}
      <div className="absolute right-4 bottom-4 z-10">
        <CameraControls
          view={view}
          night={night}
          onView={setView}
          onRotate={(radians) => controls.current?.rotate(radians)}
          onZoom={(factor) => controls.current?.zoom(factor)}
          onMap={() => setMapOpen((open) => !open)}
          onNight={setNight}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto rounded-lg bg-slate-900/80 px-4 py-3 text-sm shadow-lg backdrop-blur">
          <p className="font-semibold">Status: {status}</p>
          <p className="text-slate-400">Players online: {playerIds.length}</p>
          <p className="text-slate-400">Move with WASD / arrow keys</p>
          <p className="text-slate-400">
            {ACTION_HOTKEYS.map(
              ({ label, animation }) => `${label} ${animation}`,
            ).join(" · ")}
          </p>
          <a href="/sandbox" className="text-indigo-300 hover:text-indigo-200">
            Open movement sandbox →
          </a>
        </div>

        <div className="pointer-events-auto flex rounded-lg bg-slate-900/80 p-1 text-sm shadow-lg backdrop-blur">
          {(["babylon", "three"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRenderer(option)}
              className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                renderer === option
                  ? "bg-indigo-500 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {option === "babylon" ? "Babylon.js" : "Three.js"}
            </button>
          ))}
        </div>
      </header>

      {sessionId && (
        <p className="absolute bottom-4 left-4 text-xs text-slate-500">
          Session {sessionId}
        </p>
      )}
    </div>
  );
}
