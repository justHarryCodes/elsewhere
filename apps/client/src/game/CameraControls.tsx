// On-screen camera buttons, shared by the game and the sandbox: viewpoints, turning, zoom, the map
// and day/night. Keys: V cycles the view, M opens the map, N toggles night.
import { useEffect } from 'react';

export type CameraView = 'street' | 'chase' | 'overhead';
export const CAMERA_VIEWS: { view: CameraView; label: string }[] = [
  { view: 'street', label: 'Street' },
  { view: 'chase', label: 'Chase' },
  { view: 'overhead', label: 'Top' },
];

export interface CameraControlHandlers {
  view: CameraView;
  night: boolean;
  onView: (view: CameraView) => void;
  /** Turn the camera round the player by this many radians. */
  onRotate: (radians: number) => void;
  /** Multiply the camera distance (below 1 = closer). */
  onZoom: (factor: number) => void;
  onMap: () => void;
  onNight: (night: boolean) => void;
  /** Leave keys to the page (e.g. the sandbox already uses N). */
  keys?: boolean;
}

const button =
  'grid h-8 min-w-8 place-items-center rounded-md border border-cyan-400/30 bg-[#0b0618]/80 px-2 font-mono text-xs text-cyan-100 hover:border-fuchsia-400/70 hover:text-fuchsia-200';

export function CameraControls({ view, night, onView, onRotate, onZoom, onMap, onNight, keys = true }: CameraControlHandlers) {
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.code === 'KeyV') {
        const i = CAMERA_VIEWS.findIndex((v) => v.view === view);
        onView(CAMERA_VIEWS[(i + 1) % CAMERA_VIEWS.length].view);
      } else if (event.code === 'KeyM') {
        onMap();
      } else if (event.code === 'KeyN') {
        onNight(!night);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, view, night, onView, onMap, onNight]);

  const press = (action: () => void) => (event: React.MouseEvent<HTMLButtonElement>) => {
    action();
    event.currentTarget.blur(); // keep the keyboard on the game
  };

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg bg-[#05020c]/60 p-1 backdrop-blur">
      {CAMERA_VIEWS.map((v) => (
        <button
          key={v.view}
          type="button"
          title="Camera view (V)"
          onClick={press(() => onView(v.view))}
          className={`${button} ${view === v.view ? 'border-fuchsia-400 text-fuchsia-200 shadow-[0_0_8px_#ff2bd6]' : ''}`}
        >
          {v.label}
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-cyan-400/20" />
      <button type="button" title="Turn left" onClick={press(() => onRotate(Math.PI / 4))} className={button}>
        ⟲
      </button>
      <button type="button" title="Turn right" onClick={press(() => onRotate(-Math.PI / 4))} className={button}>
        ⟳
      </button>
      <button type="button" title="Zoom in" onClick={press(() => onZoom(0.75))} className={button}>
        +
      </button>
      <button type="button" title="Zoom out" onClick={press(() => onZoom(1 / 0.75))} className={button}>
        −
      </button>
      <span className="mx-0.5 h-5 w-px bg-cyan-400/20" />
      <button type="button" title="City map (M)" onClick={press(onMap)} className={button}>
        Map
      </button>
      <button type="button" title="Day / night (N)" onClick={press(() => onNight(!night))} className={button}>
        {night ? '☾ Night' : '☀ Day'}
      </button>
    </div>
  );
}
