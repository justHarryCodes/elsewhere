// The packed Downtown City MegaKit (scripts/city/pack_megakit.py) and the code that welds placed pieces
// into one batch of triangles per material. Renderer-neutral: the Babylon and Three.js city renderers
// both turn these batches into meshes.

import { type CityPiece, roomLook } from '@game/shared';

const BASE = '/assets/city/megakit/';

export interface KitMaterial {
  base: string | null;
  orm: string | null;
  normal: string | null;
  color: [number, number, number, number];
  blend: boolean;
  mask: boolean;
}

interface PackedPart {
  vertices: number;
  indices: number;
  p: number;
  n: number;
  uv: number;
  i: number;
}

interface KitPart {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface KitPiece {
  min: [number, number, number];
  max: [number, number, number];
  parts: Map<string, KitPart>;
}

/** Geometry welded from many pieces, all of one material. */
export interface Batch {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

// The rooms behind the windows. The kit's own fake-interior shader isn't in the free version, so each
// window gets one of the room pictures it ships with: lit (two pictures) or dark, from its `room` number.
export const ROOM_MATERIALS = ['room-lit-0', 'room-lit-1', 'room-dark'] as const;
const READY_MADE_ROOMS: Record<string, (typeof ROOM_MATERIALS)[number]> = {
  MI_FakeInterior_1: 'room-lit-0',
  MI_FakeInterior_3: 'room-lit-0',
  MI_FakeInterior_2: 'room-lit-1',
  MI_FakeInterior_4: 'room-dark',
};
export const ROOM_TEXTURES: Record<(typeof ROOM_MATERIALS)[number], string> = {
  'room-lit-0': `${BASE}textures/T_lit_interior_1.jpg`,
  'room-lit-1': `${BASE}textures/T_lit_interior_2.jpg`,
  'room-dark': `${BASE}textures/T_dark_interior.jpg`,
};

export class MegaKit {
  private constructor(
    readonly pieces: Map<string, KitPiece>,
    readonly materials: Map<string, KitMaterial>,
  ) {}

  static async load(): Promise<MegaKit> {
    const [index, blob] = await Promise.all([
      fetch(`${BASE}pieces.json`).then((r) => r.json() as Promise<{ pieces: Record<string, { min: number[]; max: number[]; parts: Record<string, PackedPart>; }>; materials: Record<string, KitMaterial> }>),
      fetch(`${BASE}pieces.bin`).then((r) => r.arrayBuffer()),
    ]);
    const pieces = new Map<string, KitPiece>();
    for (const [name, piece] of Object.entries(index.pieces)) {
      const parts = new Map<string, KitPart>();
      for (const [material, p] of Object.entries(piece.parts)) {
        parts.set(material, {
          positions: new Float32Array(blob, p.p, p.vertices * 3),
          normals: new Float32Array(blob, p.n, p.vertices * 3),
          uvs: new Float32Array(blob, p.uv, p.vertices * 2),
          indices: new Uint32Array(blob, p.i, p.indices),
        });
      }
      pieces.set(name, { min: piece.min as KitPiece['min'], max: piece.max as KitPiece['max'], parts });
    }
    return new MegaKit(pieces, new Map(Object.entries(index.materials)));
  }

  textureUrl(file: string) {
    return `${BASE}textures/${file}`;
  }

  /**
   * Welds placed pieces into one batch per material. Window rooms are split into lit and dark ones by
   * each piece's `room`, so they can glow (or not) at night.
   */
  weld(placements: Iterable<CityPiece>): Map<string, Batch> {
    // First count, so every batch is allocated once at its final size.
    const sizes = new Map<string, { vertices: number; indices: number }>();
    const keyOf = (material: string, placement: CityPiece) => {
      if (material === 'MI_FakeInterior') {
        const look = roomLook(placement.room ?? 0);
        return look.lit ? ROOM_MATERIALS[look.picture] : 'room-dark';
      }
      return READY_MADE_ROOMS[material] ?? material;
    };
    const list = [...placements];
    for (const placement of list) {
      const piece = this.pieces.get(placement.piece);
      if (!piece) continue;
      for (const [material, part] of piece.parts) {
        const key = keyOf(material, placement);
        const size = sizes.get(key) ?? { vertices: 0, indices: 0 };
        size.vertices += part.positions.length / 3;
        size.indices += part.indices.length;
        sizes.set(key, size);
      }
    }
    const batches = new Map<string, Batch & { v: number; i: number }>();
    for (const [key, size] of sizes) {
      batches.set(key, {
        positions: new Float32Array(size.vertices * 3),
        normals: new Float32Array(size.vertices * 3),
        uvs: new Float32Array(size.vertices * 2),
        indices: new Uint32Array(size.indices),
        v: 0,
        i: 0,
      });
    }
    for (const placement of list) {
      const piece = this.pieces.get(placement.piece);
      if (!piece) continue;
      const c = Math.cos(placement.yaw);
      const s = Math.sin(placement.yaw);
      const sx = placement.sx ?? 1;
      for (const [material, part] of piece.parts) {
        const batch = batches.get(keyOf(material, placement))!;
        const base = batch.v;
        const count = part.positions.length / 3;
        for (let k = 0; k < count; k++) {
          // Stretch along the piece's own X, turn about Y, move into place.
          const px = part.positions[k * 3] * sx;
          const py = part.positions[k * 3 + 1];
          const pz = part.positions[k * 3 + 2];
          const o = (base + k) * 3;
          batch.positions[o] = placement.x + px * c + pz * s;
          batch.positions[o + 1] = placement.y + py;
          batch.positions[o + 2] = placement.z - px * s + pz * c;
          const nx = part.normals[k * 3];
          const ny = part.normals[k * 3 + 1];
          const nz = part.normals[k * 3 + 2];
          batch.normals[o] = nx * c + nz * s;
          batch.normals[o + 1] = ny;
          batch.normals[o + 2] = -nx * s + nz * c;
          batch.uvs[(base + k) * 2] = part.uvs[k * 2];
          batch.uvs[(base + k) * 2 + 1] = part.uvs[k * 2 + 1];
        }
        for (let k = 0; k < part.indices.length; k++) batch.indices[batch.i + k] = base + part.indices[k];
        batch.v += count;
        batch.i += part.indices.length;
      }
    }
    return batches;
  }
}
