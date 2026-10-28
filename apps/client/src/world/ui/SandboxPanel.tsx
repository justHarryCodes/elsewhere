import { useEffect, useState } from 'react';
import {
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  LOCATION_TYPE_LABELS,
  LOCATIONS,
  defaultAppearance,
  locationById,
  type HumanAnimation,
  type HumanAppearance,
  type HumanBody,
  type PlayerPose,
  type WorldState,
} from '@game/shared';
import { CharacterControls, ClothesPanel } from '../../ui/appearanceControls';

const ANIMATIONS = Object.keys(HUMAN_ANIMATIONS) as HumanAnimation[];

/**
 * The sandbox's side panel over the new city: live stats, quick travel to every place, the camera
 * view, the player's look and clothes, and an animation to preview while standing still.
 */
export function SandboxPanel({
  state,
  pose,
  animation,
  onAnimation,
  onBody,
  onAppearance,
  onTravel,
  closeUp,
  onCamera,
  renderer,
  onRenderer,
}: {
  state: WorldState;
  pose: { current: PlayerPose };
  animation: HumanAnimation | null;
  onAnimation: (animation: HumanAnimation | null) => void;
  onBody: (body: HumanBody) => void;
  onAppearance: (appearance: HumanAppearance) => void;
  onTravel: (locationId: string) => void;
  closeUp: boolean;
  onCamera: (closeUp: boolean) => void;
  renderer: 'babylon' | 'three';
  onRenderer: (kind: 'babylon' | 'three') => void;
}) {
  // Open by default on wide screens; on a phone it would cover the game, so it starts closed.
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const [stats, setStats] = useState(pose.current);
  useEffect(() => {
    const id = window.setInterval(() => setStats({ ...pose.current }), 250);
    return () => window.clearInterval(id);
  }, [pose]);

  const { body } = state.player;
  const appearance = state.player.appearance ?? defaultAppearance(body);
  const scene = state.scene;
  const where = scene.kind === 'map' ? 'World Map' : `${scene.kind === 'interior' ? 'Inside ' : ''}${locationById(scene.locationId)?.name ?? ''}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-3 left-3 z-10 rounded-lg bg-slate-900/90 px-3 py-1.5 text-sm font-semibold text-slate-100 shadow ring-1 ring-white/10"
      >
        ☰ Sandbox
      </button>
    );
  }
  return (
    <aside className="absolute top-0 left-0 z-10 flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto bg-slate-950/85 p-4 text-sm text-slate-100 backdrop-blur">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the panel" className="rounded px-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            ✕
          </button>
          Sandbox
        </h1>
        <div className="flex gap-3 text-xs">
          <a href="/" className="text-indigo-300 hover:text-indigo-200">
            Game
          </a>
          <a href="/sandbox-classic" className="text-indigo-300 hover:text-indigo-200">
            Old city sandbox
          </a>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-900 p-3 font-mono text-xs">
        <span className="text-slate-400">scene</span>
        <span className="truncate">{where}</span>
        <span className="text-slate-400">position</span>
        <span>{scene.kind === 'map' ? '—' : `${stats.x.toFixed(1)}, ${stats.z.toFixed(1)}`}</span>
        <span className="text-slate-400">speed</span>
        <span>{stats.speed.toFixed(2)} m/s</span>
        <span className="text-slate-400">body</span>
        <span>{HUMAN_BODIES[body].label}</span>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Go to</h2>
        <div className="flex flex-wrap gap-1">
          {LOCATIONS.map((location) => (
            <button
              key={location.id}
              type="button"
              onClick={(e) => {
                onTravel(location.id);
                e.currentTarget.blur();
              }}
              className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
            >
              <span aria-hidden>{LOCATION_TYPE_LABELS[location.type].icon}</span>
              {location.name}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Renderer</h2>
        <div className="flex rounded-lg bg-slate-800 p-1">
          {(['babylon', 'three'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={(e) => {
                onRenderer(k);
                e.currentTarget.blur();
              }}
              className={`flex-1 rounded-md px-2 py-1 text-xs ${renderer === k ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {k === 'babylon' ? 'Babylon' : 'Three.js'}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Camera</h2>
        <div className="flex rounded-lg bg-slate-800 p-1">
          {([false, true] as const).map((close) => (
            <button
              key={String(close)}
              type="button"
              onClick={(e) => {
                onCamera(close);
                e.currentTarget.blur();
              }}
              className={`flex-1 rounded-md px-2 py-1 text-xs ${closeUp === close ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {close ? 'Close-up' : 'Overview'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {closeUp ? 'Behind the player: drag the view to look round.' : 'High over the place.'} On streets, roofs and inside.
        </p>
      </section>

      <CharacterControls
        body={body}
        appearance={appearance}
        onBody={onBody}
        onChange={(change) => onAppearance({ ...appearance, ...change })}
      />
      <ClothesPanel body={body} appearance={appearance} onChange={(change) => onAppearance({ ...appearance, ...change })} />

      <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Animation preview</h2>
        <select
          value={animation ?? ''}
          onChange={(e) => onAnimation((e.target.value || null) as HumanAnimation | null)}
          className="rounded-md bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— walk / idle by speed —</option>
          {ANIMATIONS.map((a) => (
            <option key={a} value={a}>
              {a} · {HUMAN_ANIMATIONS[a].library}/{HUMAN_ANIMATIONS[a].clip}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">Plays while the player stands still in a district or inside.</p>
      </section>
    </aside>
  );
}
