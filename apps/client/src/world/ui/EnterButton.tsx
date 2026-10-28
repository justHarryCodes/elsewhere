/** The big action button at the bottom of the screen: Enter at a door (and Leave inside). */
export function EnterButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-3 sm:bottom-6">
      <button
        type="button"
        onClick={onPress}
        className="pointer-events-auto animate-[pulse_2s_ease-in-out_infinite] rounded-2xl px-8 py-3.5 text-lg font-bold text-slate-900 shadow-2xl ring-2 ring-white/70 active:scale-95"
        style={{ backgroundColor: color }}
      >
        {label}
      </button>
    </div>
  );
}
