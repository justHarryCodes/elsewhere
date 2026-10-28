import { useEffect, useRef, useState } from 'react';
import type { Placement, SceneDef } from '@game/shared';
import { ASSETS, type AssetKey } from '../assets/assetManifest';
import { BabylonWorld } from './babylon/BabylonWorld';
import { type RendererKind, type SceneRenderer } from './sceneRenderer';
import { ThreeWorld } from './three/ThreeWorld';

// /kits: the Phase 1 test scene. Every hero building picked for a location, the church, and a
// street of road tiles, props and cars, drawn by either renderer from the same SceneDef.

const HEROES: [AssetKey, string][] = [
  ['house-modern', 'My House'], ['shop-dark-awning', 'Club'], ['diner-wide-awning', 'Eatery'],
  ['shop-orange-front', 'Restaurant'], ['block-wide-balconies', 'Civic Center'], ['tower-green-stripe', 'Project HQ'],
  ['block-wide-planters', 'Library'], ['shop-small-blue', 'Boutique'], ['shop-green-front', 'Gadget Store'],
  ['hall-arched', 'Gym'], ['block-canopy', 'Clinic'], ['cafe-rooftop', 'Cafe'], ['hall-sawtooth', 'Bus Station'],
  ['block-long', 'School'],
];
const SPACING = 22;

function testScene(): SceneDef {
  const placements: Placement[] = HEROES.map(([asset, name], i) => ({
    asset, x: (i % 7 - 3) * SPACING, z: Math.floor(i / 7) * -26, label: `${name} · ${modelName(asset)}`,
  }));
  placements.push({ asset: 'church', x: -3 * SPACING, z: -54, label: 'Church · architecture-pack/church (not Kenney)' });
  // A street: road tiles with a crossing, lamps, props, parked cars.
  const street: [AssetKey, number][] = [['road-straight', -10], ['road-crossing', 0], ['road-straight', 10], ['road-intersection', 20], ['road-straight', 30]];
  for (const [asset, x] of street) placements.push({ asset, x: x + 5, z: -54, rotY: Math.PI / 2 });
  placements.push(
    { asset: 'street-lamp', x: -2, z: -48.6, rotY: Math.PI, label: 'Roads kit · street-lamp, tiles' },
    { asset: 'traffic-light', x: 22, z: -48.6, rotY: Math.PI },
    { asset: 'dumpster', x: 30, z: -47.8 },
    { asset: 'bench', x: 12, z: -47.8, label: 'graveyard/bench' },
    { asset: 'tree-large', x: 38, z: -47 },
    { asset: 'planter', x: 6, z: -47.5 },
    { asset: 'sedan', x: 2, z: -56, rotY: Math.PI / 2, label: 'Car kit · sedan, taxi, van' },
    { asset: 'taxi', x: 14, z: -52, rotY: -Math.PI / 2 },
    { asset: 'van', x: 30, z: -56, rotY: Math.PI / 2 },
  );
  return {
    id: 'kit-test',
    ground: { size: 260, color: '#8fbf72' },
    placements,
    view: { target: { x: 0, z: -24 }, distance: 150, pitchDeg: 42, yawDeg: 0 },
  };
}

function modelName(asset: AssetKey) {
  const { url } = ASSETS[asset];
  return url.split('/').slice(-2).join('/').replace('.glb', '').replace('kenney-city-kit-', '');
}

export function KitTestPage() {
  const [kind, setKind] = useState<RendererKind>('babylon');
  const [status, setStatus] = useState('Loading…');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const scene = useRef(testScene());

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer: SceneRenderer = kind === 'babylon' ? new BabylonWorld(canvas, { orbit: true }) : new ThreeWorld(canvas, { orbit: true });
    let frame = 0;
    let alive = true;
    const started = performance.now();
    setStatus('Loading…');
    renderer
      .loadScene(scene.current)
      .then(() => alive && setStatus(`${scene.current.placements.length} placements in ${((performance.now() - started) / 1000).toFixed(1)} s`))
      .catch((error: unknown) => alive && setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`));
    // Labels: HTML over the canvas, at each labelled placement's ground point.
    const tick = () => {
      const labels = labelsRef.current;
      if (labels) {
        scene.current.placements.forEach((p, i) => {
          const el = labels.children[i] as HTMLElement | undefined;
          if (!el) return;
          const at = p.label ? renderer.project(p.x, 0, p.z + 7) : null;
          el.style.display = at ? 'block' : 'none';
          if (at) el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, 0)`;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, [kind]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* A fresh canvas per renderer: a WebGL context can't be shared between engines. */}
      <canvas key={kind} ref={canvasRef} className="h-full w-full touch-none outline-none" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0">
        {scene.current.placements.map((p, i) => (
          <div key={i} className="absolute top-0 left-0 rounded bg-slate-900/80 px-1.5 py-0.5 text-[11px] whitespace-nowrap">
            {p.label}
          </div>
        ))}
      </div>
      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-slate-900/85 p-2 text-sm">
        <span className="font-semibold">Kit test</span>
        {(['babylon', 'three'] as RendererKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-2 py-0.5 ${kind === k ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            {k === 'babylon' ? 'Babylon' : 'Three.js'}
          </button>
        ))}
        <span className="text-slate-400">{status}</span>
      </div>
    </div>
  );
}
