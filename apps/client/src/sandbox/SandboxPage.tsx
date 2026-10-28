import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CITY_ZONE_LABELS,
  HAIR_COLORS,
  HAIR_STYLES,
  HUMAN_ANIMATIONS,
  HUMAN_BODIES,
  SKIN_TONES,
  type HumanAppearance,
  type HairColor,
  type HairStyle,
  type SkinTone,
  PAINT_FINISHES,
  VEHICLE_MODELS,
  type AnimationLibrary,
  type HeadlightMode,
  type HumanAnimation,
  type HumanBody,
  type VehicleModelKey,
} from '@game/shared';
import { CameraControls } from '../game/CameraControls';
import { CityMap } from '../game/CityMap';
import { ClothesPanel, Swatches, skinSwatch } from '../ui/appearanceControls';
import { type MoveMode, MovementSandbox, type SandboxPlace, type SandboxStats } from './movementSandbox';

const ANIMATIONS = Object.entries(HUMAN_ANIMATIONS) as [HumanAnimation, (typeof HUMAN_ANIMATIONS)[HumanAnimation]][];
const LIBRARY_ORDER: AnimationLibrary[] = ['actions', 'relaxed', 'ual2', 'ual1'];
const LIBRARY_LABELS: Record<AnimationLibrary, string> = {
  ual1: 'UAL1 · locomotion & core',
  ual2: 'UAL2 · primary library',
  relaxed: 'Relaxed · walk, jog, sprint',
  actions: 'Actions · furniture',
};
const MOVE_MODES: MoveMode[] = ['walk', 'jog', 'sprint'];
const SPEED_RATIOS = [0.25, 0.5, 1, 1.5, 2];
const VEHICLES = (Object.entries(VEHICLE_MODELS) as [VehicleModelKey, (typeof VEHICLE_MODELS)[VehicleModelKey]][]).sort(
  (a, b) => a[1].label.localeCompare(b[1].label),
);
const PLACES: { place: SandboxPlace; label: string }[] = [
  { place: 'yard', label: 'Test yard' },
  { place: 'residential', label: CITY_ZONE_LABELS.residential },
  { place: 'commercial', label: CITY_ZONE_LABELS.commercial },
  { place: 'leisure', label: CITY_ZONE_LABELS.leisure },
];
const HEADLIGHT_MODES: HeadlightMode[] = ['off', 'low', 'high'];
// Common car paints: white, silver, black, red, blue, yellow, green, orange.
const PAINTS = ['#f1f5f9', '#94a3b8', '#111827', '#dc2626', '#2563eb', '#facc15', '#15803d', '#ea580c'];

export function SandboxPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sandboxRef = useRef<MovementSandbox | undefined>(undefined);
  const [stats, setStats] = useState<SandboxStats>();
  const [query, setQuery] = useState('');
  const [speedRatio, setSpeedRatio] = useState(1);
  const [showBounds, setShowBounds] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    const sandbox = new MovementSandbox(canvasRef.current!);
    sandboxRef.current = sandbox;
    // Handy in the browser console during development: sandbox.setNight(true), sandbox.toggleVehicle()...
    if (import.meta.env.DEV) Object.assign(window, { sandbox });
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

      <div className="absolute top-3 right-3 z-10">
        <CameraControls
          view={stats?.view ?? 'chase'}
          night={stats?.night ?? true}
          onView={(view) => sandbox()?.setCameraView(view)}
          onRotate={(radians) => sandbox()?.rotateCamera(radians)}
          onZoom={(factor) => sandbox()?.zoomCamera(factor)}
          onMap={() => setMapOpen((open) => !open)}
          onNight={(night) => sandbox()?.setNight(night)}
        />
      </div>
      {mapOpen && sandboxRef.current && (
        <CityMap
          city={sandboxRef.current.cityPlan}
          player={() => sandbox()?.mapPlayer()}
          onNavigate={(x, z) => sandbox()?.goTo(x, z)}
          onClose={() => setMapOpen(false)}
        />
      )}

      {stats?.loading && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/60 text-sm">
          Loading characters &amp; animation libraries…
        </div>
      )}
      {stats?.error && (
        <div className="absolute inset-x-0 top-0 bg-red-600 px-4 py-2 text-sm">Failed to load assets: {stats.error}</div>
      )}
      {stats?.vehicleError && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600 px-4 py-2 text-sm">
          Failed to load the car or physics: {stats.vehicleError}
        </div>
      )}

      {stats?.nearVehicle && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg bg-slate-950/80 px-4 py-2 text-sm">
          Press <kbd className="rounded bg-slate-700 px-1.5 py-0.5 font-mono">E</kbd> to drive
        </div>
      )}

      {stats?.door && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg bg-slate-950/80 px-4 py-2 text-sm">
          Press <kbd className="rounded bg-slate-700 px-1.5 py-0.5 font-mono">E</kbd>{' '}
          {stats.door.label}
        </div>
      )}
      {stats?.room && !stats.door && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-950/70 px-3 py-1 text-xs">
          {stats.room}
        </div>
      )}

      {stats?.driving && stats.vehicle && (
        <div className="pointer-events-none absolute right-6 bottom-6 flex items-end gap-4 rounded-xl bg-slate-950/80 px-5 py-4">
          <div className="text-right">
            <div className="font-mono text-5xl leading-none font-semibold tabular-nums">
              {stats.vehicle.speedKmh.toFixed(0)}
            </div>
            <div className="text-xs text-slate-400">km/h</div>
          </div>
          <div className="flex flex-col items-center gap-1 font-mono text-sm">
            <span className="text-2xl font-semibold text-emerald-300">{stats.vehicle.gear}</span>
            <span className={stats.vehicle.braking ? 'text-red-400' : 'text-slate-600'}>BRK</span>
            <span className={stats.vehicle.headlights !== 'off' ? 'text-amber-200' : 'text-slate-600'}>
              {stats.vehicle.headlights === 'high' ? 'HI' : 'LO'}
            </span>
          </div>
        </div>
      )}

      <aside className="absolute top-0 left-0 flex h-full w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto bg-slate-950/85 p-4 text-sm backdrop-blur">
        <header className="flex items-center justify-between">
          <h1 className="text-base font-semibold">Movement sandbox</h1>
          <a href="/city" className="text-indigo-300 hover:text-indigo-200">
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

        <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
          <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Character</h2>
          <div className="flex gap-2">
            <select
              id="character-body"
              value={stats?.body ?? 'male'}
              onChange={(event) => {
                sandbox()?.setBody(event.target.value as HumanBody);
                event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.keys(HUMAN_BODIES) as HumanBody[]).map((body) => (
                <option key={body} value={body}>
                  {HUMAN_BODIES[body].label}
                </option>
              ))}
            </select>
            <select
              id="character-hair"
              value={stats?.appearance.hair ?? 'none'}
              onChange={(event) => {
                sandbox()?.setAppearance({ hair: event.target.value as HairStyle });
                event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.keys(HAIR_STYLES) as HairStyle[]).map((hair) => (
                <option key={hair} value={hair}>
                  {HAIR_STYLES[hair].label}
                </option>
              ))}
            </select>
          </div>
          <Swatches
            label="Skin"
            options={(Object.keys(SKIN_TONES) as SkinTone[]).map((key) => ({ key, label: SKIN_TONES[key].label, colour: skinSwatch(key) }))}
            value={stats?.appearance.skin}
            onChange={(skin) => sandbox()?.setAppearance({ skin })}
          />
          <Swatches
            label="Hair colour"
            options={(Object.keys(HAIR_COLORS) as HairColor[]).map((key) => ({ key, label: HAIR_COLORS[key].label, colour: HAIR_COLORS[key].hex }))}
            value={stats?.appearance.hairColor}
            onChange={(hairColor) => sandbox()?.setAppearance({ hairColor })}
          />
          {stats && HUMAN_BODIES[stats.body].base === 'male' && (
            <label className="flex items-center gap-2">
              <input
                id="character-beard"
                type="checkbox"
                checked={stats.appearance.beard}
                onChange={(event) => {
                  sandbox()?.setAppearance({ beard: event.target.checked });
                  event.currentTarget.blur();
                }}
              />
              Beard
            </label>
          )}
        </section>
        {stats && (
          <ClothesPanel
            body={stats.body}
            appearance={stats.appearance}
            onChange={(change) => sandbox()?.setAppearance(change)}
          />
        )}
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

        <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
          <h2 className="text-sm font-semibold">City</h2>
          <p className="text-xs text-slate-400">
            1 km of streets north of the yard: family homes to the west, shops in the middle, and Parkside to the east
            (fairground, skate park, graveyard, arcade, grocery, diner), with a monorail round it.
            Press E at a door to go in.
          </p>
          <div className="grid grid-cols-5 gap-1">
            {PLACES.map(({ place, label }) => (
              <button
                key={place}
                type="button"
                onClick={(event) => {
                  sandbox()?.teleport(place);
                  event.currentTarget.blur();
                }}
                className="rounded-md bg-slate-800 px-1 py-1 text-xs hover:bg-slate-700"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={(event) => {
                sandbox()?.goHome();
                event.currentTarget.blur();
              }}
              className="rounded-md bg-amber-700 px-1 py-1 text-xs hover:bg-amber-600"
            >
              My home
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
          <header className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Vehicle</h2>
            <span className="text-xs text-slate-400">
              {!stats?.vehicle
                ? 'Loading…'
                : stats.boarding
                  ? 'Getting in or out…'
                  : stats.driving
                    ? 'Driving · stop, then E to get out'
                    : 'Walk up and press E'}
            </span>
          </header>

          <div className="flex gap-2">
            <select
              id="vehicle-model"
              value={stats?.vehicle?.model ?? 'policeCar'}
              disabled={!stats?.vehicle}
              onChange={(event) => {
                sandbox()?.setVehicleModel(event.target.value as VehicleModelKey);
                event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {VEHICLES.map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!stats?.vehicle}
              onClick={(event) => {
                sandbox()?.respawnVehicle();
                event.currentTarget.blur();
              }}
              className="rounded-md bg-slate-800 px-3 py-1 hover:bg-slate-700"
              title="Put the car back on its wheels"
            >
              Respawn
            </button>
          </div>
          {stats?.vehicle && !stats.vehicle.features.wheels && (
            <p className="text-xs text-amber-200/80">This model's wheels are part of its body, so they don't spin or steer.</p>
          )}

          <div className={`flex items-center gap-1.5 ${stats?.vehicle?.features.paint ? '' : 'pointer-events-none opacity-40'}`}>
            <button
              type="button"
              aria-label="Original colour"
              title="Original colour"
              onClick={(event) => {
                sandbox()?.setVehiclePaint('');
                event.currentTarget.blur();
              }}
              className={`h-6 w-6 rounded-full border-2 bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)] ${
                stats?.vehicle?.paint === '' ? 'border-indigo-400' : 'border-slate-700'
              }`}
            />
            {PAINTS.map((paint) => (
              <button
                key={paint}
                type="button"
                aria-label={`Paint ${paint}`}
                onClick={(event) => {
                  sandbox()?.setVehiclePaint(paint);
                  event.currentTarget.blur();
                }}
                className={`h-6 w-6 rounded-full border-2 ${
                  stats?.vehicle?.paint === paint ? 'border-indigo-400' : 'border-slate-700'
                }`}
                style={{ backgroundColor: paint }}
              />
            ))}
            <input
              id="vehicle-paint"
              type="color"
              value={stats?.vehicle?.paint || '#ffffff'}
              onChange={(event) => sandbox()?.setVehiclePaint(event.target.value)}
              className="h-6 w-8 cursor-pointer rounded bg-transparent"
              title="Any colour"
            />
          </div>

          <Segmented
            label={stats?.vehicle?.features.paint ? 'Paint finish' : 'Paint finish (this model is texture-painted)'}
            options={PAINT_FINISHES}
            value={stats?.vehicle?.finish}
            onChange={(finish) => sandbox()?.setPaintFinish(finish)}
          />

          <Segmented
            label={stats?.vehicle?.features.headlights ? 'Headlights (L)' : 'Headlights (L) · none on this model'}
            options={HEADLIGHT_MODES}
            value={stats?.vehicle?.headlights}
            onChange={(mode) => sandbox()?.setHeadlights(mode)}
          />

          <div className="flex items-center justify-between">
            <label className={`flex items-center gap-2 ${stats?.vehicle?.hasSiren ? '' : 'text-slate-500'}`}>
              <input
                id="vehicle-siren"
                type="checkbox"
                checked={stats?.vehicle?.siren ?? false}
                disabled={!stats?.vehicle?.hasSiren}
                onChange={(event) => {
                  sandbox()?.setSiren(event.target.checked);
                  event.currentTarget.blur();
                }}
              />
              Siren (K)
            </label>
            <label className="flex items-center gap-2">
              <input
                id="sandbox-night"
                type="checkbox"
                checked={stats?.night ?? false}
                onChange={(event) => {
                  sandbox()?.setNight(event.target.checked);
                  event.currentTarget.blur();
                }}
              />
              Night (N)
            </label>
          </div>
        </section>

        <section className="flex min-h-64 flex-1 flex-col gap-2">
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
          wheel to zoom · In the car: W/S throttle and brake (hold S to reverse) · A/D steer · Space handbrake
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
