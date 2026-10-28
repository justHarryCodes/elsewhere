import { useEffect, useState } from 'react';

export interface SheetOption {
  id: string;
  label: string;
  icon: string;
}

/**
 * The actions for something tapped (a bed, a couch, a door), sliding up from the bottom of the screen.
 * Kept mounted while it slides away, so it animates both ways.
 */
export function ActionSheet({
  title,
  options,
  onPick,
  onClose,
}: {
  title: string | null;
  options: SheetOption[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const open = title !== null;
  // Keep the last contents while it slides away.
  const [shown, setShown] = useState({ title: title ?? '', options });
  useEffect(() => {
    if (title !== null) setShown({ title, options });
  }, [title, options]);

  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-900/95 p-4 text-slate-100 shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{shown.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {shown.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={(e) => {
                onPick(option.id);
                e.currentTarget.blur();
              }}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-3 text-left text-sm font-medium hover:bg-slate-700 active:bg-indigo-600"
            >
              <span className="text-xl" aria-hidden>
                {option.icon}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** While an action runs: what it is, a countdown, and a way to stop early. */
export function ActivityPill({ label, icon, endsAt, onStop }: { label: string; icon: string; endsAt: number; onStop: () => void }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <div className="absolute inset-x-0 top-14 z-20 flex justify-center px-3">
      <div className="flex items-center gap-3 rounded-full bg-slate-900/90 py-1.5 pr-1.5 pl-4 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
        <span aria-hidden>{icon}</span>
        <span className="font-medium">{label}</span>
        <span className="font-mono text-slate-400 tabular-nums">{left}s</span>
        <button type="button" onClick={onStop} className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold hover:bg-slate-600">
          Stop
        </button>
      </div>
    </div>
  );
}
