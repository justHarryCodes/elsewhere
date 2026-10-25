import { useEffect, useMemo, useRef, useState } from 'react';
import { CITY_CELL, type City, type CityZone, cityObjectRect, cityZoneAt } from '@game/shared';

const ZONE_STYLE: Record<CityZone, { label: string; lot: string; building: string; edge: string }> = {
  residential: { label: 'HOMES', lot: '#0c2321', building: 'rgba(31,209,178,0.28)', edge: '#1fd1b2' },
  commercial: { label: 'DOWNTOWN', lot: '#1a0f2e', building: 'rgba(255,43,214,0.3)', edge: '#ff2bd6' },
  industrial: { label: 'INDUSTRY', lot: '#1f1a10', building: 'rgba(255,176,46,0.25)', edge: '#ffb02e' },
};
const ROAD = '#2c2547';

export interface MapPlayer {
  x: number;
  z: number;
  /** Radians, 0 faces +Z (north on the map). */
  heading: number;
}

/**
 * A neon plan of the whole city, north (+Z) up. Shows where you are; click anywhere to go there
 * (the nearest street). Closes on Escape, M, or a click outside the map.
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
    ctx.fillStyle = '#07040f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ROAD;
    for (const r of city.roads) ctx.fillRect(px(r.x - CITY_CELL / 2), pz(r.z + CITY_CELL / 2), CITY_CELL * scale, CITY_CELL * scale);
    for (const b of city.blocks) {
      ctx.fillStyle = ZONE_STYLE[b.zone].lot;
      ctx.fillRect(px(b.x0), pz(b.z1), (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
    }
    ctx.lineWidth = 1.5;
    for (const o of city.objects) {
      if (!o.model.includes('/building')) continue;
      const r = cityObjectRect(o);
      const style = ZONE_STYLE[cityZoneAt(city, o.x) ?? 'commercial'];
      ctx.fillStyle = style.building;
      ctx.strokeStyle = style.edge;
      ctx.globalAlpha = Math.min(1, 0.45 + r.height / 40); // taller glows brighter
      ctx.fillRect(px(r.x0), pz(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      ctx.strokeRect(px(r.x0), pz(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
    }
    ctx.globalAlpha = 1;
    // District names along the top.
    ctx.font = `bold ${14 * scale}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    for (const d of city.districts) {
      ctx.fillStyle = ZONE_STYLE[d.zone].edge;
      ctx.shadowColor = ZONE_STYLE[d.zone].edge;
      ctx.shadowBlur = 12;
      ctx.fillText(ZONE_STYLE[d.zone].label, px((d.x0 + d.x1) / 2), 26 * scale);
    }
    return canvas;
  }, [city, width, depth, x0, z1]);

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
        ctx.strokeStyle = '#19f0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, pulse, 0, Math.PI * 2);
        ctx.stroke();
        // Arrow along the heading: +Z is up the map.
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-me.heading + Math.PI);
        ctx.fillStyle = '#19f0ff';
        ctx.shadowColor = '#19f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.lineTo(6, -6);
        ctx.lineTo(0, -2);
        ctx.lineTo(-6, -6);
        ctx.closePath();
        ctx.fill();
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
      className="absolute inset-0 z-20 grid place-items-center bg-[#05020c]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex w-full max-w-5xl flex-col gap-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between font-mono text-xs tracking-widest text-fuchsia-300">
          <span className="drop-shadow-[0_0_6px_#ff2bd6]">CITY MAP · CLICK TO TRAVEL</span>
          <button type="button" onClick={onClose} className="rounded border border-fuchsia-500/50 px-2 py-0.5 hover:bg-fuchsia-500/20">
            CLOSE [M]
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={1200}
          height={Math.round((1200 * depth) / width)}
          className="w-full cursor-crosshair rounded-lg border border-cyan-400/40 shadow-[0_0_30px_rgba(25,240,255,0.25)]"
          onMouseMove={(event) => setHover(toWorld(event))}
          onMouseLeave={() => setHover(undefined)}
          onClick={(event) => {
            const at = toWorld(event);
            onNavigate(at.x, at.z);
            onClose();
          }}
        />
        <div className="h-4 font-mono text-xs text-cyan-200/80">
          {hover && `${hoverZone ? ZONE_STYLE[hoverZone].label : 'OUTSKIRTS'} · ${hover.x.toFixed(0)}, ${hover.z.toFixed(0)}`}
        </div>
      </div>
    </div>
  );
}
