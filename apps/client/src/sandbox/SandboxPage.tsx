import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  type AnimationLibrary,
  type HumanAnimation,
  type HumanBody,
} from '@game/shared';
import { type MoveMode, MovementSandbox, type SandboxStats } from './movementSandbox';

const ANIMATIONS = Object.entries(HUMAN_ANIMATIONS) as [HumanAnimation, (typeof HUMAN_ANIMATIONS)[HumanAnimation]][];
const LIBRARY_ORDER: AnimationLibrary[] = ['ual2', 'ual1'];
const LIBRARY_LABELS: Record<AnimationLibrary, string> = {
  ual1: 'UAL1 · locomotion & core',
  ual2: 'UAL2 · primary library',
};
const MOVE_MODES: MoveMode[] = ['walk', 'jog', 'sprint'];
const SPEED_RATIOS = [0.25, 0.5, 1, 1.5, 2];

export function SandboxPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sandboxRef = useRef<MovementSandbox | undefined>(undefined);
  const [stats, setStats] = useState<SandboxStats>();
  const [query, setQuery] = useState('');
  const [speedRatio, setSpeedRatio] = useState(1);
  const [showBounds, setShowBounds] = useState(false);

  useEffect(() => {
    const sandbox = new MovementSandbox(canvasRef.current!);
    sandboxRef.current = sandbox;
    const interval = window.setInterval(() => setStats(sandbox.getStats()), 100);
    return () => {
      window.clearInterval(interval);
      sandbox.dispose();
      sandboxRef.current = undefined;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANIMATIONS.filter(([key, { clip }]) => !q || key.toLowerCase().includes(q) || clip.toLowerCase().includes(q));
  }, [query]);

  const sandbox = () => sandboxRef.current;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900 text-slate-100">
      <canvas ref={canvasRef} className="block h-full w-full outline-none" />

      {stats?.loading && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/60 text-sm">
          Loading characters &amp; animation libraries…
        </div>
      )}
      {stats?.error && (
        <div className="absolute inset-x-0 top-0 bg-red-600 px-4 py-2 text-sm">Failed to load assets: {stats.error}</div>
      )}

      <aside className="absolute top-0 left-0 flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-hidden bg-slate-950/85 p-4 text-sm backdrop-blur">
        <header className="flex items-center justify-between">
          <h1 className="text-base font-semibold">Movement sandbox</h1>
          <a href="/" className="text-indigo-300 hover:text-indigo-200">
            ← Game
          </a>
        </header>

        <section className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-900 p-3 font-mono text-xs">
          <span className="text-slate-400">animation</span>
          <span className="truncate text-emerald-300">{stats?.animation ?? '—'}</span>
          <span className="text-slate-400">speed</span>
          <span>{stats?.speed.toFixed(2) ?? '0.00'} m/s</span>
          <span className="text-slate-400">grounded</span>
          <span>{stats?.grounded ? 'yes' : 'no'}</span>
          <span className="text-slate-400">position</span>
          <span>
            {stats ? `${stats.position.x.toFixed(1)}, ${stats.position.y.toFixed(2)}, ${stats.position.z.toFixed(1)}` : '—'}
          </span>
          <span className="text-slate-400">heading</span>
          <span>{stats?.headingDeg.toFixed(0) ?? 0}°</span>
          <span className="text-slate-400">model height</span>
          <span>{stats?.heightMeters ? `${stats.heightMeters.toFixed(2)} m` : '—'}</span>
          <span className="text-slate-400">fps</span>
          <span>{stats?.fps.toFixed(0) ?? 0}</span>
        </section>

        <Segmented
          label="Body"
          options={Object.keys(HUMAN_BODIES) as HumanBody[]}
          value={stats?.body}
          onChange={(body) => sandbox()?.setBody(body)}
        />
        <Segmented
          label="Move mode"
          options={MOVE_MODES}
          value={stats?.moveMode}
          onChange={(mode) => sandbox()?.setMoveMode(mode)}
        />
        <Segmented
          label="Playback speed"
          options={SPEED_RATIOS}
          value={speedRatio}
          format={(ratio) => `${ratio}×`}
          onChange={(ratio) => {
            setSpeedRatio(ratio);
            sandbox()?.setSpeedRatio(ratio);
          }}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showBounds}
              onChange={(event) => {
                setShowBounds(event.target.checked);
                sandbox()?.setShowBounds(event.target.checked);
              }}
            />
            Bounding boxes
          </label>
          <button
            type="button"
            onClick={() => sandbox()?.resetPosition()}
            className="rounded-md bg-slate-800 px-3 py-1 hover:bg-slate-700"
          >
            Reset position
          </button>
        </div>

        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${ANIMATIONS.length} animations…`}
            className="rounded-md bg-slate-800 px-3 py-1.5 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500"
          />
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {LIBRARY_ORDER.map((library) => {
              const items = filtered.filter(([, clip]) => clip.library === library);
              if (!items.length) return null;
              return (
                <div key={library} className="mb-3">
                  <h2 className="sticky top-0 bg-slate-950 py-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                    {LIBRARY_LABELS[library]}
                  </h2>
                  {items.map(([key, { clip, loop }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={(event) => {
                        sandbox()?.playAnimation(key);
                        event.currentTarget.blur(); // keep Space/WASD for the character
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-slate-800 ${
                        stats?.animation === key ? 'bg-indigo-600/40' : ''
                      }`}
                    >
                      <span className="truncate">
                        {key} <span className="text-slate-500">{clip}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">{loop ? 'loop' : 'once'}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="text-xs leading-relaxed text-slate-400">
          WASD / arrows move (camera-relative) · Shift sprint · C walk toggle · Space jump · drag to orbit ·
          wheel to zoom
        </footer>
      </aside>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  format = String,
  onChange,
}: {
  label: string;
  options: T[];
  value: T | undefined;
  format?: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex rounded-lg bg-slate-900 p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={(event) => {
              onChange(option);
              event.currentTarget.blur();
            }}
            className={`flex-1 rounded-md px-2 py-1 capitalize transition-colors ${
              value === option ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
