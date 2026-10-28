import { useEffect, useRef } from 'react';
import { LOCATION_TYPE_LABELS, LOCATIONS } from '@game/shared';
import type { SceneRenderer } from '../sceneRenderer';

/**
 * A floating name tag over every place on the map: HTML over the canvas, so it always faces the
 * camera and keeps its size. When tags overlap, the one earlier in LOCATIONS (higher priority) stays.
 */
export function NameTags({ renderer, selectedId }: { renderer: SceneRenderer | null; selectedId: string | null }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!renderer) return;
    let frame = 0;
    const tick = () => {
      const tags = holder.current ? (Array.from(holder.current.children) as HTMLElement[]) : [];
      const taken: DOMRect[] = [];
      // Priority order, but the selected place always shows.
      const order = LOCATIONS.map((_, i) => i).sort((a, b) => Number(LOCATIONS[b].id === selectedId) - Number(LOCATIONS[a].id === selectedId));
      for (const i of order) {
        const location = LOCATIONS[i];
        const tag = tags[i];
        if (!tag) continue;
        const at = renderer.project(location.mapPos.x, renderer.heightOf(location.id) + 2.5, location.mapPos.z);
        if (!at) {
          tag.style.visibility = 'hidden';
          continue;
        }
        const w = tag.offsetWidth;
        const h = tag.offsetHeight;
        const rect = new DOMRect(at.x - w / 2, at.y - h, w, h);
        const clash = taken.some((r) => rect.left < r.right + 4 && rect.right + 4 > r.left && rect.top < r.bottom + 2 && rect.bottom + 2 > r.top);
        tag.style.visibility = clash ? 'hidden' : 'visible';
        tag.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
        if (!clash) taken.push(rect);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [renderer, selectedId]);

  return (
    <div ref={holder} className="pointer-events-none absolute inset-0 overflow-hidden">
      {LOCATIONS.map((location) => (
        <div
          key={location.id}
          className={`absolute top-0 left-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap shadow-md ${
            location.id === selectedId ? 'ring-2 ring-white' : ''
          }`}
          style={{ backgroundColor: location.tagColor, color: readableOn(location.tagColor), visibility: 'hidden' }}
        >
          <span aria-hidden>{LOCATION_TYPE_LABELS[location.type].icon}</span>
          {location.name}
        </div>
      ))}
    </div>
  );
}

/** Dark text on light tags, white on dark ones. */
function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#111827' : '#ffffff';
}
