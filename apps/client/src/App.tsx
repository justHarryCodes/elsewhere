import { useState } from "react";
import { BabylonScene } from "./game/babylon/BabylonScene";
import { ThreeScene } from "./game/three/ThreeScene";
import { ACTION_HOTKEYS, useActionHotkeys } from "./game/useActionHotkeys";
import { useKeyboardInput } from "./game/useKeyboardInput";
import { useGameRoom } from "./net/useGameRoom";

type Renderer = "babylon" | "three";

export function App() {
  const [renderer, setRenderer] = useState<Renderer>("babylon");
  const { status, players, playerIds, sessionId, citySeed, sendInput, sendAction } =
    useGameRoom();
  useKeyboardInput(sendInput);
  useActionHotkeys(sendAction);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100">
      {citySeed === undefined ? null : renderer === "babylon" ? (
        <BabylonScene players={players} selfId={sessionId} citySeed={citySeed} />
      ) : (
        <ThreeScene players={players} selfId={sessionId} citySeed={citySeed} />
      )}

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
