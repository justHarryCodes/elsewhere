// Rooms inside the town's buildings: the player's own home and the public buildings, plus some houses,
// shops, cafés and offices. Each is a furnished room laid out for what the building is, built in its
// own space under the building (so it never shows from the street): walk up to the front door and go
// in, and you come out in the room; the door inside takes you back out to the street.
//
// Rooms are bigger than the buildings look from outside (as in most games): a house the size of a
// shed outside still gets a living room, kitchen, bedroom and bathroom inside.

import type { CityBox, CityPiece, CityShape } from './city';

export type InteriorKind =
  | 'home'
  | 'house'
  | 'shop'
  | 'cafe'
  | 'office'
  | 'police'
  | 'fire'
  | 'hospital'
  | 'school'
  | 'townHall'
  | 'bank'
  | 'post'
  | 'library';

export interface CityInterior {
  kind: InteriorKind;
  /** What it's called on screen ("Your home", "Police", "Shop"...). */
  name: string;
  /** Index into city.buildings. */
  building: number;
  /** Outside: where you stand at the front door, and the way out from it (radians, 0 = +Z). */
  door: { x: number; z: number; heading: number };
  /** Inside: where you come in (just inside the door, facing into the room), floor height included. */
  entry: { x: number; y: number; z: number; heading: number };
  /** The room's middle and its floor, and its size along and across the building's front. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  pieces: CityPiece[];
  shapes: CityShape[];
}

/** Room height, and how thick its walls are drawn and collide (thick enough for the camera to stop at). */
export const INTERIOR_HEIGHT = 3.2;
const WALL = 2.4;

// Furniture (scripts/city/pack_town.py: 'furniture/<name>', centred, front toward +Z): width, height, depth.
const FURNITURE = {
  bedDouble: [2.01, 0.79, 2.36],
  bedSingle: [1.2, 0.79, 2.36],
  cabinetBedDrawerTable: [0.56, 0.55, 0.46],
  loungeSofa: [2.06, 0.97, 0.86],
  loungeSofaCorner: [2.06, 0.97, 2.06],
  loungeChair: [1.03, 0.97, 0.86],
  loungeDesignSofa: [2.35, 0.84, 0.86],
  tableCoffee: [1.39, 0.48, 0.84],
  tableCoffeeGlass: [1.39, 0.48, 0.84],
  table: [1.77, 0.69, 0.94],
  tableRound: [1.45, 0.77, 1.68],
  tableCloth: [1.77, 0.69, 0.94],
  chair: [0.42, 0.99, 0.42],
  chairCushion: [0.42, 0.97, 0.42],
  chairDesk: [0.7, 1.28, 0.66],
  chairModernCushion: [0.42, 0.97, 0.42],
  desk: [1.54, 0.81, 0.82],
  deskCorner: [2.05, 0.81, 2.05],
  bookcaseOpen: [0.84, 1.85, 0.53],
  bookcaseClosedWide: [1.68, 1.66, 0.53],
  bookcaseOpenLow: [0.84, 0.84, 0.53],
  books: [0.32, 0.22, 0.2],
  televisionModern: [1.44, 0.95, 0.27],
  cabinetTelevision: [1.68, 0.65, 0.53],
  rugRectangle: [3.3, 0.02, 1.93],
  rugRound: [1.93, 0.02, 1.93],
  rugRounded: [3.3, 0.02, 1.93],
  rugDoormat: [0.9, 0.02, 0.5],
  lampRoundFloor: [0.32, 1.81, 0.37],
  lampSquareTable: [0.25, 0.61, 0.25],
  lampRoundTable: [0.32, 0.66, 0.37],
  pottedPlant: [0.45, 1.37, 0.51],
  plantSmall1: [0.2, 0.29, 0.2],
  plantSmall2: [0.2, 0.29, 0.2],
  sideTable: [1.12, 0.81, 0.46],
  coatRackStanding: [0.57, 1.62, 0.57],
  kitchenFridgeLarge: [1.09, 1.93, 0.85],
  kitchenCabinet: [0.9, 0.94, 0.94],
  kitchenCabinetDrawer: [0.9, 0.94, 0.94],
  kitchenCabinetUpper: [0.9, 0.82, 0.46],
  kitchenStove: [0.9, 0.94, 0.94],
  kitchenSink: [0.9, 1.03, 0.94],
  kitchenBar: [0.9, 0.88, 0.44],
  kitchenBarEnd: [0.21, 0.88, 0.44],
  kitchenMicrowave: [0.61, 0.38, 0.48],
  kitchenCoffeeMachine: [0.4, 0.37, 0.5],
  stoolBar: [0.56, 0.91, 0.48],
  toilet: [0.66, 0.95, 1.0],
  bathtub: [2.5, 0.88, 1.18],
  shower: [1.18, 2.3, 1.22],
  bathroomCabinetDrawer: [0.9, 0.99, 0.67],
  bathroomMirror: [0.63, 0.91, 0.3],
  washer: [0.82, 0.99, 0.82],
  dryer: [0.82, 0.99, 0.8],
  computerScreen: [0.82, 0.62, 0.22],
  computerKeyboard: [0.59, 0.06, 0.25],
  laptop: [0.55, 0.34, 0.5],
  speaker: [0.31, 1.34, 0.31],
  radio: [0.66, 0.48, 0.2],
  cardboardBoxClosed: [0.45, 0.59, 0.45],
  cardboardBoxOpen: [0.78, 0.59, 0.45],
  trashcan: [0.44, 0.9, 0.49],
  pillow: [0.48, 0.47, 0.19],
  bear: [0.82, 0.94, 0.52],
  benchCushion: [0.84, 0.97, 0.42],
  coatRack: [0.94, 0.59, 0.28],
  'file-cabinet': [0.64, 1.3, 0.55],
  'water-cooler': [0.3, 1.3, 0.35],
  'vending-machine': [1.01, 1.95, 1.06],
  whiteboard: [2.81, 1.9, 0.08],
  printer: [0.6, 0.45, 0.86],
  'office-chair': [0.7, 1.1, 0.79],
  'wall-art': [0.55, 0.9, 0.03],
  'cash-register': [0.37, 0.35, 0.33],
  'can-fridge': [1.05, 1.95, 0.59],
  'coffee-machine': [0.36, 0.5, 0.48],
} as const;
type Furniture = keyof typeof FURNITURE;
/** Things you walk over or that sit on something else: no collider. */
const NOT_SOLID = new Set<Furniture>([
  'rugRectangle', 'rugRound', 'rugRounded', 'rugDoormat', 'books', 'lampSquareTable', 'lampRoundTable', 'plantSmall1',
  'plantSmall2', 'computerScreen', 'computerKeyboard', 'laptop', 'kitchenMicrowave', 'kitchenCoffeeMachine', 'pillow',
  'kitchenCabinetUpper', 'bathroomMirror', 'wall-art', 'cash-register', 'coffee-machine', 'radio', 'printer',
]);

/** Each kind: what it's called, room size (along the front, back from it), wall and floor colours. */
const KINDS: Record<InteriorKind, { name: string; width: number; depth: number; wall: string; floor: string }> = {
  home: { name: 'Your home', width: 13, depth: 10, wall: '#efe6d6', floor: '#a7774f' },
  house: { name: 'House', width: 9, depth: 7, wall: '#e8e0cf', floor: '#9c6f48' },
  shop: { name: 'Shop', width: 10, depth: 8, wall: '#f2efe8', floor: '#c9c3b8' },
  cafe: { name: 'Café', width: 10, depth: 8, wall: '#e9d8bf', floor: '#7d5a3d' },
  office: { name: 'Offices', width: 12, depth: 9, wall: '#e6e9ec', floor: '#8c939b' },
  police: { name: 'Police', width: 14, depth: 10, wall: '#dfe5ee', floor: '#5d6b80' },
  fire: { name: 'Fire station', width: 13, depth: 9, wall: '#efe2d8', floor: '#8b8b8b' },
  hospital: { name: 'Hospital', width: 16, depth: 10, wall: '#f4f8f8', floor: '#cfe3e3' },
  school: { name: 'School', width: 14, depth: 10, wall: '#f4ecd2', floor: '#b88a5a' },
  townHall: { name: 'Town hall', width: 14, depth: 10, wall: '#ece6da', floor: '#7b5a3f' },
  bank: { name: 'Bank', width: 13, depth: 9, wall: '#ece8de', floor: '#d8d2c4' },
  post: { name: 'Post office', width: 11, depth: 8, wall: '#f1e9dc', floor: '#9a9a9a' },
  library: { name: 'Library', width: 14, depth: 10, wall: '#efe4cf', floor: '#8a6646' },
};

export interface InteriorPlace {
  kind: InteriorKind;
  building: number;
  /** Middle of the room (under the building) and its floor height. */
  x: number;
  y: number;
  z: number;
  /** The building's front faces this way (radians): the room's door is in that wall. */
  yaw: number;
  /** Where the front door is outside, and the way out. */
  door: { x: number; z: number; heading: number };
  name?: string;
}

/** Lays out a room: walls, floor, furniture and their colliders. */
export function buildInterior(place: InteriorPlace, random: () => number): { interior: CityInterior; colliders: CityBox[] } {
  const spec = KINDS[place.kind];
  const { width: w, depth: d } = spec;
  const c = Math.cos(place.yaw);
  const s = Math.sin(place.yaw);
  // Room space: x across the front, z toward the front door (+Z), floor at y = 0.
  const toWorld = (x: number, z: number) => ({ x: place.x + x * c + z * s, z: place.z - x * s + z * c });
  const pieces: CityPiece[] = [];
  const shapes: CityShape[] = [];
  const colliders: CityBox[] = [];
  const box = (x: number, z: number, y: number, bw: number, bh: number, bd: number, color: string, solid = true, drawn = true) => {
    const at = toWorld(x, z);
    if (drawn) shapes.push({ kind: 'box', x: at.x, y: place.y + y, z: at.z, w: bw, h: bh, d: bd, yaw: place.yaw, color });
    if (solid) {
      // Turned a quarter: the box's own width runs along world Z.
      const across = Math.abs(s) > 0.5;
      colliders.push({ x: at.x, y: place.y + y + bh / 2, z: at.z, hx: (across ? bd : bw) / 2, hy: bh / 2, hz: (across ? bw : bd) / 2 });
    }
  };
  /** A piece of furniture at room (x, z), turned `turn` from facing the door (+Z), `y` up off the floor. */
  const put = (name: Furniture, x: number, z: number, turn = 0, y = 0) => {
    const at = toWorld(x, z);
    const yaw = place.yaw + turn;
    pieces.push({ piece: `furniture/${name}`, x: at.x, y: place.y + y, z: at.z, yaw });
    if (NOT_SOLID.has(name) || y > 0.3) return;
    const [fw, fh, fd] = FURNITURE[name];
    const across = Math.abs(Math.sin(yaw)) > 0.5;
    colliders.push({ x: at.x, y: place.y + fh / 2, z: at.z, hx: (across ? fd : fw) / 2, hy: fh / 2, hz: (across ? fw : fd) / 2 });
  };
  const size = (name: Furniture) => FURNITURE[name];
  /** Against a wall, facing into the room: back (facing the door), left (-x), right (+x) or front. */
  const against = (name: Furniture, wall: 'back' | 'left' | 'right' | 'front', along: number, y = 0) => {
    const [, , fd] = size(name);
    if (wall === 'back') put(name, along, -d / 2 + fd / 2 + 0.02, 0, y);
    else if (wall === 'front') put(name, along, d / 2 - fd / 2 - 0.02, Math.PI, y);
    else if (wall === 'left') put(name, -w / 2 + fd / 2 + 0.02, along, Math.PI / 2, y);
    else put(name, w / 2 - fd / 2 - 0.02, along, -Math.PI / 2, y);
  };
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];

  // Floor, four walls (thick, round the outside of the room), the door and a mat inside it, and a
  // dark backdrop all round, for what the camera sees past the walls.
  // Drawn thin, doll's-house style: the wall with the door (the near one, as you come in) only knee
  // high so the camera sees over it; they all collide full height and thick.
  box(0, 0, -0.3, w + 2 * WALL, 0.3, d + 2 * WALL, spec.floor, true, false);
  box(0, 0, -0.3, w + 0.5, 0.3, d + 0.5, spec.floor, false);
  box(0, 0, -0.7, 50, 0.3, 50, '#16181d', false);
  box(0, -d / 2 - WALL / 2, 0, w + 2 * WALL, INTERIOR_HEIGHT, WALL, spec.wall, true, false);
  box(0, d / 2 + WALL / 2, 0, w + 2 * WALL, INTERIOR_HEIGHT, WALL, spec.wall, true, false);
  box(-w / 2 - WALL / 2, 0, 0, WALL, INTERIOR_HEIGHT, d, spec.wall, true, false);
  box(w / 2 + WALL / 2, 0, 0, WALL, INTERIOR_HEIGHT, d, spec.wall, true, false);
  const thin = 0.25;
  box(0, -d / 2 - thin / 2, 0, w + 2 * thin, 2.7, thin, spec.wall, false);
  box(0, d / 2 + thin / 2, 0, w + 2 * thin, 0.9, thin, spec.wall, false);
  box(-w / 2 - thin / 2, 0, 0, thin, 2.7, d, spec.wall, false);
  box(w / 2 + thin / 2, 0, 0, thin, 2.7, d, spec.wall, false);
  // A skirting line along the walls, and the door: a frame and a wooden leaf, flat on the front wall.
  for (const [x, z, bw, bd] of [[0, -d / 2 + 0.03, w, 0.06], [0, d / 2 - 0.03, w, 0.06], [-w / 2 + 0.03, 0, 0.06, d], [w / 2 - 0.03, 0, 0.06, d]] as const) {
    box(x, z, 0, bw, 0.12, bd, '#ffffff', false);
  }
  box(0, d / 2 - 0.04, 0, 1.4, 2.3, 0.08, '#f4f1ea', false);
  box(0, d / 2 - 0.09, 0, 1.1, 2.15, 0.06, '#7a5235', false);
  put('rugDoormat', 0, d / 2 - 0.6);
  /** An inside wall, from (x0, z0) to (x1, z1) along one axis, with gaps where `doors` are. */
  const partition = (x0: number, z0: number, x1: number, z1: number, doors: number[]) => {
    const alongX = z0 === z1;
    const from = alongX ? x0 : z0;
    const to = alongX ? x1 : z1;
    const gaps = [...doors].sort((a, b) => a - b);
    let start = from;
    for (const g of [...gaps, Infinity]) {
      const end = g === Infinity ? to : g - 0.6;
      if (end - start > 0.05) {
        const mid = (start + end) / 2;
        if (alongX) box(mid, z0, 0, end - start, 2.7, 0.14, spec.wall);
        else box(x0, mid, 0, 0.14, 2.7, end - start, spec.wall);
      }
      start = g + 0.6;
    }
  };

  switch (place.kind) {
    case 'home': {
      // Back: bedroom (left) and bathroom (right) behind a wall; front: living room (left) and kitchen.
      const split = -1;
      partition(-w / 2, split, w / 2, split, [-0.6, 1.6]);
      partition(0.5, -d / 2, 0.5, split, []);
      // Bedroom.
      against('bedDouble', 'back', -3);
      against('cabinetBedDrawerTable', 'back', -4.4);
      against('cabinetBedDrawerTable', 'back', -1.6);
      put('lampRoundTable', -4.4, -d / 2 + 0.25, 0, 0.55);
      put('lampRoundTable', -1.6, -d / 2 + 0.25, 0, 0.55);
      put('pillow', -3.4, -d / 2 + 0.45, 0, 0.62);
      put('pillow', -2.6, -d / 2 + 0.45, 0, 0.62);
      against('bookcaseOpen', 'left', -2.2);
      put('rugRound', -3, -2.1);
      put('bear', -6, -4.5, 0.6);
      // Bathroom.
      against('bathtub', 'back', 4.9);
      against('toilet', 'back', 1.2);
      against('bathroomCabinetDrawer', 'back', 2.45);
      put('bathroomMirror', 2.45, -d / 2 + 0.1, 0, 1.35);
      against('washer', 'right', -1.6);
      // Living room: sofa facing the TV on the left wall, coffee table and rug between, a reading corner.
      against('cabinetTelevision', 'left', 1.6);
      put('televisionModern', -w / 2 + 0.3, 1.6, Math.PI / 2, 0.65);
      put('rugRectangle', -4.2, 1.6, Math.PI / 2);
      put('tableCoffee', -4.2, 1.6, Math.PI / 2);
      put('loungeSofa', -2.4, 1.6, -Math.PI / 2);
      put('loungeChair', -4.2, -0.2, 0);
      against('lampRoundFloor', 'left', -0.4);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      against('bookcaseClosedWide', 'front', -4.2);
      put('speaker', -w / 2 + 0.3, 3.2);
      // Kitchen along the right wall, a dining table with four chairs.
      against('kitchenFridgeLarge', 'right', -0.4);
      against('kitchenSink', 'right', 0.6);
      against('kitchenStove', 'right', 1.5);
      against('kitchenCabinetDrawer', 'right', 2.4);
      against('kitchenCabinet', 'right', 3.3);
      for (const z of [0.6, 1.5, 2.4, 3.3]) put('kitchenCabinetUpper', w / 2 - 0.25, z, -Math.PI / 2, 1.55);
      put('kitchenCoffeeMachine', w / 2 - 0.4, 2.4, -Math.PI / 2, 0.94);
      put('kitchenMicrowave', w / 2 - 0.45, 3.3, -Math.PI / 2, 0.94);
      put('table', 3, 2.2);
      for (const x of [2.5, 3.5]) {
        put('chairCushion', x, 1.5);
        put('chairCushion', x, 2.9, Math.PI);
      }
      put('coatRackStanding', 1.3, d / 2 - 0.5);
      put('pottedPlant', 5.9, d / 2 - 0.5);
      break;
    }
    case 'house': {
      against('cabinetTelevision', 'left', 0);
      put('televisionModern', -w / 2 + 0.3, 0, Math.PI / 2, 0.65);
      put('rugRectangle', -2.2, 0, Math.PI / 2);
      put('tableCoffee', -2.2, 0, Math.PI / 2);
      put('loungeSofa', -0.6, 0, -Math.PI / 2);
      against('bedSingle', 'back', 2.8);
      against('cabinetBedDrawerTable', 'back', 1.8);
      against('kitchenFridgeLarge', 'right', 0.4);
      against('kitchenSink', 'right', 1.4);
      against('kitchenStove', 'right', 2.3);
      put('tableRound', 2, 2, 0);
      put('chair', 1.4, 1.2);
      put('chair', 2.6, 2.8, Math.PI);
      against(pick(['bookcaseOpen', 'bookcaseClosedWide'] as const), 'back', -2.5);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      put('lampRoundFloor', -w / 2 + 0.4, -d / 2 + 0.5);
      break;
    }
    case 'shop': {
      // Shelves round the walls, a counter with the till by the door, a drinks fridge.
      for (let x = -w / 2 + 0.6; x < w / 2 - 0.5; x += 0.86) against('bookcaseOpen', 'back', x);
      for (let z = -d / 2 + 1.4; z < d / 2 - 2.2; z += 0.86) against('bookcaseOpen', 'left', z);
      for (const z of [-1.5, 1.1]) {
        for (let x = -2.2; x < 1.8; x += 0.86) {
          put('bookcaseOpenLow', x, z - 0.27, Math.PI);
          put('bookcaseOpenLow', x, z + 0.27);
        }
      }
      for (let z = 0.4; z < 2.6; z += 0.9) put('kitchenBar', w / 2 - 1.6, z, -Math.PI / 2);
      put('cash-register', w / 2 - 1.6, 1.3, Math.PI / 2, 0.88);
      against('can-fridge', 'right', -2.3);
      for (const [x, z] of [[-3.8, 3.2], [-3.2, 3.2], [-3.5, 2.6]] as const) put('cardboardBoxClosed', x, z, random());
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      break;
    }
    case 'cafe': {
      for (let z = -2.4; z < 0.8; z += 0.9) put('kitchenBar', w / 2 - 2, z, -Math.PI / 2);
      put('coffee-machine', w / 2 - 2, -1.6, Math.PI / 2, 0.88);
      put('cash-register', w / 2 - 2, 0.2, Math.PI / 2, 0.88);
      against('kitchenFridgeLarge', 'right', -2.6);
      against('kitchenCabinet', 'right', -1.5);
      against('kitchenCoffeeMachine', 'right', -0.6, 0.94);
      against('kitchenCabinet', 'right', -0.6);
      for (const [x, z] of [[-3, -2], [-3, 1.4], [0, -2.2], [0, 1.4]] as const) {
        put('tableRound', x, z);
        put('chairCushion', x - 1, z, Math.PI / 2);
        put('chairCushion', x + 1, z, -Math.PI / 2);
      }
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, -d / 2 + 0.5);
      against('can-fridge', 'back', 2.2);
      break;
    }
    case 'office':
    case 'police': {
      // Desks in rows facing the door, each with a screen and chair; filing along the back wall.
      const rows = place.kind === 'police' ? [-2.2, 0.6] : [-2.6, -0.2, 2.2];
      for (const z of rows) {
        for (const x of place.kind === 'police' ? [-4.2, -1.4, 1.4] : [-3.6, -1.2, 1.2, 3.6]) {
          put('desk', x, z, Math.PI);
          put('computerScreen', x + 0.2, z + 0.15, Math.PI, 0.81);
          put('computerKeyboard', x + 0.2, z - 0.15, Math.PI, 0.81);
          put('office-chair', x, z - 0.85);
        }
      }
      for (let x = -w / 2 + 0.6; x < w / 2 - 3; x += 0.7) against('file-cabinet', 'back', x);
      against('water-cooler', 'right', -d / 2 + 0.6);
      against('printer', 'right', -d / 2 + 1.6, 0);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      if (place.kind === 'police') {
        // The front desk across the right of the door, a bench and a vending machine.
        for (let x = 2.2; x < w / 2 - 0.4; x += 0.9) put('kitchenBar', x, 2.6, Math.PI);
        put('computerScreen', 3.6, 2.6, Math.PI, 0.88);
        against('vending-machine', 'right', 1.4);
        put('benchCushion', -3, d / 2 - 0.4, Math.PI);
        put('benchCushion', -4, d / 2 - 0.4, Math.PI);
        against('whiteboard', 'left', -1, 0.6);
      } else {
        against('whiteboard', 'left', 0, 0.6);
        against('vending-machine', 'right', 2.6);
      }
      break;
    }
    case 'fire': {
      // A crew room: lockers, a big table, sofas and the TV.
      for (let x = -w / 2 + 1; x < 0; x += 1.7) against('bookcaseClosedWide', 'back', x);
      for (let x = 1; x < w / 2 - 0.5; x += 1) against('coatRack', 'back', x, 1.4);
      for (let x = 1; x < w / 2 - 0.5; x += 1) against('benchCushion', 'back', x);
      put('tableCloth', -2.5, 0.6);
      for (const x of [-3, -2]) {
        put('chair', x, -0.1);
        put('chair', x, 1.3, Math.PI);
      }
      against('kitchenFridgeLarge', 'right', 0);
      against('kitchenSink', 'right', 1);
      against('kitchenStove', 'right', 1.9);
      put('loungeSofa', 2.4, 2.2, Math.PI);
      against('cabinetTelevision', 'front', -4.4);
      put('televisionModern', -4.4, d / 2 - 0.3, Math.PI, 0.65);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      break;
    }
    case 'hospital': {
      // A ward of beds along the back, reception by the door, chairs to wait on.
      for (let x = -w / 2 + 1.4; x < w / 2 - 1; x += 2.4) {
        against('bedSingle', 'back', x);
        against('cabinetBedDrawerTable', 'back', x + 1);
      }
      for (let x = 2.4; x < w / 2 - 0.4; x += 0.9) put('kitchenBar', x, 1.6, Math.PI);
      put('computerScreen', 3.6, 1.6, Math.PI, 0.88);
      for (let x = -6.6; x < -1.6; x += 0.6) put('chairCushion', x, d / 2 - 0.4, Math.PI);
      against('water-cooler', 'left', 1.2);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -1.2, d / 2 - 0.5);
      break;
    }
    case 'school': {
      // A classroom: the whiteboard and the teacher's desk at the back, pupils' desks facing them.
      against('whiteboard', 'back', 0, 0.6);
      put('desk', 3, -d / 2 + 1.8);
      put('chairDesk', 3, -d / 2 + 1.0);
      for (const z of [-1, 0.8, 2.6]) {
        for (const x of [-4.5, -1.5, 1.5, 4.5]) {
          put('table', x, z, Math.PI);
          put('chair', x - 0.45, z + 0.75, Math.PI);
          put('chair', x + 0.45, z + 0.75, Math.PI);
        }
      }
      for (let z = -d / 2 + 1; z < 2; z += 0.86) against('bookcaseOpen', 'left', z);
      against('coatRack', 'right', 3.4, 1.4);
      put('pottedPlant', w / 2 - 0.4, -d / 2 + 0.5);
      break;
    }
    case 'townHall': {
      // The council table.
      put('rugRounded', 0, -0.6);
      for (const x of [-1.8, 0, 1.8]) {
        put('tableCloth', x, -0.6);
        put('chairCushion', x - 0.45, -1.4);
        put('chairCushion', x + 0.45, -1.4);
        put('chairCushion', x - 0.45, 0.2, Math.PI);
        put('chairCushion', x + 0.45, 0.2, Math.PI);
      }
      for (let x = -w / 2 + 1; x < w / 2 - 1; x += 1.7) against('bookcaseClosedWide', 'back', x);
      against('pottedPlant', 'left', -2);
      against('pottedPlant', 'left', 2);
      against('pottedPlant', 'right', -2);
      against('pottedPlant', 'right', 2);
      for (const x of [-4.5, 4.5]) put('wall-art', x, -d / 2 + 0.05, 0, 1.6);
      put('benchCushion', -3.5, d / 2 - 0.4, Math.PI);
      put('benchCushion', 3.5, d / 2 - 0.4, Math.PI);
      break;
    }
    case 'bank': {
      // Tellers behind a long counter across the room; desks for the clerks behind them.
      for (let x = -w / 2 + 0.5; x < w / 2 - 0.4; x += 0.9) if (Math.abs(x - 4.1) > 0.6) put('kitchenBar', x, -0.6, Math.PI);
      for (const x of [-4, -1, 2]) put('computerScreen', x, -0.65, Math.PI, 0.88);
      for (const x of [-3.5, 0, 3.5]) {
        put('desk', x, -d / 2 + 1.2, Math.PI);
        put('office-chair', x, -d / 2 + 0.6, Math.PI);
      }
      put('benchCushion', -3, d / 2 - 0.4, Math.PI);
      put('benchCushion', -4, d / 2 - 0.4, Math.PI);
      against('water-cooler', 'left', 2);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, -0.2);
      break;
    }
    case 'post': {
      for (let x = -1.8; x < 2.6; x += 0.9) put('kitchenBar', x, 0, Math.PI);
      put('cash-register', 0, 0, Math.PI, 0.88);
      for (let x = -w / 2 + 0.5; x < -1; x += 0.5) {
        for (let k = 0; k < 3; k++) put(random() < 0.5 ? 'cardboardBoxClosed' : 'cardboardBoxOpen', x, -d / 2 + 0.4 + k * 0.85, random() * 0.3);
      }
      for (let x = 1; x < w / 2 - 0.4; x += 0.7) against('file-cabinet', 'back', x);
      put('benchCushion', 3.5, d / 2 - 0.4, Math.PI);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      break;
    }
    case 'library': {
      // Rows of shelves at the back, reading tables with lamps in front.
      for (const z of [-d / 2 + 0.3, -2.4]) for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += 0.86) put('bookcaseOpen', x, z + 0.27, z < -3 ? 0 : Math.PI);
      for (const z of [-0.6]) for (let x = -w / 2 + 0.6; x < -1; x += 0.86) put('bookcaseOpen', x, z, 0);
      for (const [x, z] of [[2, 0.6], [5, 0.6], [2, 3], [5, 3]] as const) {
        put('table', x, z);
        put('lampSquareTable', x + 0.5, z, 0, 0.69);
        put('books', x - 0.4, z, random(), 0.69);
        put('chair', x - 0.4, z - 0.75);
        put('chair', x + 0.4, z + 0.75, Math.PI);
      }
      put('loungeChair', -4, 2.6, Math.PI / 4);
      put('lampRoundFloor', -5, 3.6);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      break;
    }
  }

  const inside = toWorld(0, d / 2 - 1.3);
  const interior: CityInterior = {
    kind: place.kind,
    name: place.name ?? spec.name,
    building: place.building,
    door: place.door,
    entry: { x: inside.x, y: place.y, z: inside.z, heading: place.yaw + Math.PI },
    x: place.x,
    y: place.y,
    z: place.z,
    yaw: place.yaw,
    width: w,
    depth: d,
    pieces,
    shapes,
  };
  return { interior, colliders };
}

/** The interior whose door (outside) or way out (inside) is within `reach` of a point, if any. */
export function interiorDoorAt(
  interiors: readonly CityInterior[],
  x: number,
  y: number,
  z: number,
  reach = 2.2,
): { interior: CityInterior; inside: boolean } | undefined {
  for (const interior of interiors) {
    if (Math.abs(y - interior.y) < 2 && Math.hypot(x - interior.entry.x, z - interior.entry.z) < reach) return { interior, inside: true };
    if (y > -1 && Math.hypot(x - interior.door.x, z - interior.door.z) < reach) return { interior, inside: false };
  }
  return undefined;
}
