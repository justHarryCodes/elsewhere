import { useEffect, useMemo, useRef, useState } from 'react';
import { CITY_ZONE_LABELS, type City, type CityVenue, type CityZone, cityZoneAt } from '@game/shared';

// A sunny planning map: green lots, pale sidewalks, grey streets, buildings coloured by district.
const ZONE_STYLE: Record<CityZone, { label: string; lot: string; building: string; edge: string; text: string }> = {
  residential: { label: CITY_ZONE_LABELS.residential.toUpperCase(), lot: '#a8d88a', building: '#f6b26b', edge: '#b9722c', text: '#7a4510' },
  commercial: { label: CITY_ZONE_LABELS.commercial.toUpperCase(), lot: '#cfd8c4', building: '#8db8e6', edge: '#3f6fa3', text: '#1f4672' },
  leisure: { label: CITY_ZONE_LABELS.leisure.toUpperCase(), lot: '#b4e09c', building: '#f19bc9', edge: '#b0457f', text: '#8a2560' },
};
const LOT_COLOURS = { lawn: '#9fd47e', path: '#efe9dc', parking: '#a3a8b4', yard: '#a3a8b4', plaza: '#ece4d1', dirt: '#d4bb8f' } as const;
const ROAD = '#8a909d';
const SIDEWALK = '#e9e5dc';
const MONORAIL = '#e8487f';
/** What Parkside's lots are called on the map. */
const VENUE_LABELS: Partial<Record<CityVenue, string>> = {
  fairground: 'Fairground',
  skatepark: 'Skate park',
  graveyard: 'Graveyard',
  arcade: 'Arcade',
  market: 'Grocery',
  diner: 'Diner',
  foodcourt: 'Food court',
};

export interface MapPlayer {
  x: number;
  z: number;
  /** Radians, 0 faces +Z (north on the map). */
  heading: number;
}

/**
 * A plan of the whole town, north (+Z) up, with the monorail's loop and Parkside's lots named. Shows
 * where you are; click anywhere to go there (the nearest street). Closes on Escape, M, or a click
 * outside the map.
 */
export function CityMap({
  city,
  player,
  onNavigate,
  onClose,
}: {
  city: City;
  /** Read every frame for the "you are here" marker. */
  player: () => MapPlayer | undefined;
  onNavigate: (x: number, z: number) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; z: number }>();
  const { x0, z0, x1, z1 } = city.bounds;
  const width = x1 - x0;
  const depth = z1 - z0;

  // The streets and buildings never change: draw them once.
  const plan = useMemo(() => {
    const scale = 2; // canvas pixels per metre, so it stays crisp when shown large
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = depth * scale;
    const ctx = canvas.getContext('2d')!;
    const px = (x: number) => (x - x0) * scale;
    const pz = (z: number) => (z1 - z) * scale;
    ctx.fillStyle = '#c7e3ad';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const rect = (r: { x0: number; z0: number; x1: number; z1: number }) => [px(r.x0), pz(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale] as const;
    ctx.fillStyle = ROAD;
    for (const r of city.roads) ctx.fillRect(...rect(r));
    ctx.fillStyle = SIDEWALK;
    for (const s of city.sidewalks) ctx.fillRect(...rect(s));
    for (const b of city.blocks) {
      ctx.fillStyle = ZONE_STYLE[b.zone].lot;
      ctx.fillRect(...rect(b));
    }
    for (const lot of city.lots) {
      ctx.fillStyle = LOT_COLOURS[lot.kind];
      ctx.fillRect(...rect(lot));
    }
    ctx.lineWidth = 1.5;
    for (const r of city.buildings) {
      const style = ZONE_STYLE[r.zone];
      ctx.fillStyle = style.building;
      ctx.strokeStyle = style.edge;
      ctx.fillRect(px(r.x0), pz(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      ctx.strokeRect(px(r.x0), pz(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
    }
    // The monorail's loop.
    const { path } = city.monorail;
    if (path.length > 1) {
      ctx.strokeStyle = MONORAIL;
      ctx.lineWidth = 2.5 * scale;
      ctx.setLineDash([8 * scale, 4 * scale]);
      ctx.beginPath();
      path.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), pz(p.z)) : ctx.lineTo(px(p.x), pz(p.z))));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const label = (text: string, x: number, y: number, colour: string, size: number) => {
      ctx.font = `bold ${size * scale}px ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Parkside's lots, then the district names along the top.
    for (const b of city.blocks) {
      const name = b.venue && VENUE_LABELS[b.venue];
      if (name) label(name, px((b.x0 + b.x1) / 2), pz((b.z0 + b.z1) / 2), ZONE_STYLE.leisure.text, 9);
    }
    for (const d of city.districts) label(ZONE_STYLE[d.zone].label, px((d.x0 + d.x1) / 2), 24 * scale, ZONE_STYLE[d.zone].text, 14);
    label('MONORAIL', px(path[0]?.x ?? x1) - 34 * scale, pz((z0 + z1) / 2), MONORAIL, 9);
    return canvas;
  }, [city, width, depth, x0, x1, z0, z1]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    const draw = (time: number) => {
      ctx.drawImage(plan, 0, 0, canvas.width, canvas.height);
      const me = player();
      if (me) {
        const sx = ((me.x - x0) / width) * canvas.width;
        const sy = ((z1 - me.z) / depth) * canvas.height;
        const pulse = 10 + 4 * Math.sin(time / 200);
        ctx.strokeStyle = '#1f6feb';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, pulse, 0, Math.PI * 2);
        ctx.stroke();
        // Arrow along the heading: +Z is up the map.
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-me.heading + Math.PI);
        ctx.fillStyle = '#1f6feb';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.lineTo(6, -6);
        ctx.lineTo(0, -2);
        ctx.lineTo(-6, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [plan, player, x0, z1, width, depth]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Escape' || event.code === 'KeyM') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const toWorld = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: x0 + ((event.clientX - rect.left) / rect.width) * width,
      z: z1 - ((event.clientY - rect.top) / rect.height) * depth,
    };
  };
  const hoverZone = hover && cityZoneAt(city, hover.x);

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex w-full max-w-5xl flex-col gap-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between text-xs font-semibold tracking-wide text-white">
          <span>TOWN MAP · CLICK TO TRAVEL</span>
          <button type="button" onClick={onClose} className="rounded-full bg-white/90 px-3 py-0.5 text-slate-800 hover:bg-white">
            CLOSE [M]
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={1200}
          height={Math.round((1200 * depth) / width)}
          className="w-full cursor-crosshair rounded-xl border-4 border-white shadow-xl"
          onMouseMove={(event) => setHover(toWorld(event))}
          onMouseLeave={() => setHover(undefined)}
          onClick={(event) => {
            const at = toWorld(event);
            onNavigate(at.x, at.z);
            onClose();
          }}
        />
        <div className="h-4 text-xs font-medium text-white/90">
          {hover && `${hoverZone ? ZONE_STYLE[hoverZone].label : 'OUTSKIRTS'} · ${hover.x.toFixed(0)}, ${hover.z.toFixed(0)}`}
        </div>
      </div>
    </div>
  );
}
