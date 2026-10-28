import { LOCATION_TYPE_LABELS, type LocationDef } from '@game/shared';

/** The bottom sheet for a selected place: its name, what kind of place it is, and Go there. */
export function LocationSheet({ location, onGo, onClose }: { location: LocationDef; onGo: () => void; onClose: () => void }) {
  const type = LOCATION_TYPE_LABELS[location.type];
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900/95 p-4 text-slate-100 shadow-2xl ring-1 ring-white/10">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ backgroundColor: location.tagColor }}>
          <span aria-hidden>{type.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{location.name}</div>
          <div className="text-sm text-slate-400">{type.label}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={onGo}
          className="rounded-xl bg-indigo-500 px-4 py-2.5 font-semibold text-white shadow hover:bg-indigo-400 active:bg-indigo-600"
        >
          Go there
        </button>
      </div>
    </div>
  );
}
