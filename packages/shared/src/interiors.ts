// Inside the town's buildings. Every building you can go into has a real floor plan (interior-plans.ts,
// built with interior-builder.ts): homes are studios, flats with separate rooms, or duplexes with stairs
// up to the bedrooms and a door up to a terrace on the building's actual roof; offices, the hospital,
// the game centre and the event centre are big, multi-room (and multi-storey) places with staff at their
// posts and visitors about. Smaller public buildings (shops, the café, police, school...) are one big
// furnished room. Rooms are built away from the street (under the town) and seen doll's-house style
// from above: walk up to the front door and go in; the door inside takes you back out.
//
// Rooms are bigger than the buildings look from outside (as in most games), but only where it's worth
// it: a corner shop stays a corner shop.

import type { CityBox, CityPiece, CityShape } from './city';
import {
  type Finish,
  type Furniture,
  INTERIOR_HEIGHT,
  InteriorBuilder,
  type InteriorLink,
  type InteriorRoom,
  type InteriorSpot,
  type InteriorStairs,
  type PlanRoom,
  type Stand,
} from './interior-builder';
import { FLOORS, PAPERS, duplex, eventCentre, flat, gameCentre, hospital, offices, studio } from './interior-plans';

export { INTERIOR_HEIGHT, type Finish, type InteriorLink, type InteriorRoom, type InteriorSpot, type InteriorStairs, type Stand };

export type InteriorKind =
  | 'home'
  | 'house'
  | 'apartment'
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
  | 'library'
  | 'gamecentre'
  | 'eventcentre'
  | 'market'
  | 'diner';

export interface CityInterior {
  kind: InteriorKind;
  /** What it's called on screen ("Your home", "Studio flat", "Hospital"...). */
  name: string;
  /** Index into city.buildings. */
  building: number;
  /** Outside: where you stand at the front door, and the way out from it (radians, 0 = +Z). */
  door: { x: number; z: number; heading: number };
  /** Inside: where you come in (just inside the door, facing into the room), floor height included. */
  entry: Stand;
  /** The plan's middle and its ground floor, which way its front faces, its size and storeys. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  levels: number;
  /** The rooms (world rectangles, by level) and the doorways between them, for people walking about. */
  rooms: InteriorRoom[];
  links: InteriorLink[];
  /** Where staff stand at their posts and where visitors like to be. */
  spots: InteriorSpot[];
  /** The flights of stairs between floors. */
  stairs: InteriorStairs[];
  /** The door up to the roof terrace (inside) and the stair hut on the real roof (outside). */
  roof?: { inside: Stand; outside?: Stand };
  pieces: CityPiece[];
  shapes: CityShape[];
}

export interface InteriorPlace {
  kind: InteriorKind;
  building: number;
  /** Middle of the plan and its ground floor's height. */
  x: number;
  y: number;
  z: number;
  /** The building's front faces this way (radians): the plan's front door is in that wall. */
  yaw: number;
  /** Where the front door is outside, and the way out. */
  door: { x: number; z: number; heading: number };
  /** A house's storeys outside (two-storey houses get an upstairs inside). */
  storeys?: number;
  /** A home on a flat roof: a duplex with a door up to a roof terrace. */
  roof?: boolean;
  name?: string;
}

/** What the single-room public buildings are called, their size, and the papers and floors that suit them. */
const ROOMS: Partial<Record<InteriorKind, { name: string; width: number; depth: number; walls: Finish[]; floors: Finish[] }>> = {
  shop: { name: 'Shop', width: 11, depth: 9, walls: [PAPERS.mint, PAPERS.sun, PAPERS.cream], floors: [FLOORS.lino, FLOORS.tiles] },
  cafe: { name: 'Café', width: 11, depth: 9, walls: [PAPERS.sun, PAPERS.brick, PAPERS.coral], floors: [FLOORS.walnut, FLOORS.checker] },
  police: { name: 'Police', width: 15, depth: 11, walls: [PAPERS.office], floors: [FLOORS.slate] },
  fire: { name: 'Fire station', width: 14, depth: 10, walls: [PAPERS.brick], floors: [FLOORS.lino] },
  school: { name: 'School', width: 15, depth: 11, walls: [PAPERS.stars, PAPERS.sky], floors: [FLOORS.oak] },
  townHall: { name: 'Town hall', width: 15, depth: 11, walls: [PAPERS.gold, PAPERS.cream], floors: [FLOORS.walnut] },
  bank: { name: 'Bank', width: 14, depth: 10, walls: [PAPERS.cream, PAPERS.teal], floors: [FLOORS.marble] },
  post: { name: 'Post office', width: 12, depth: 9, walls: [PAPERS.mustard], floors: [FLOORS.lino] },
  library: { name: 'Library', width: 15, depth: 11, walls: [PAPERS.sage, PAPERS.cream], floors: [FLOORS.walnut] },
  market: { name: 'Grocery', width: 15, depth: 11, walls: [PAPERS.produce], floors: [FLOORS.tiles] },
  diner: { name: 'Diner', width: 13, depth: 10, walls: [PAPERS.candy], floors: [FLOORS.checker] },
};

/** Lays out a building's inside: the plan for its kind, furnished, with colliders. */
export function buildInterior(place: InteriorPlace, random: () => number): { interior: CityInterior; colliders: CityBox[] } {
  const at = { x: place.x, y: place.y, z: place.z, yaw: place.yaw };
  let b: InteriorBuilder;
  let name = place.name;
  switch (place.kind) {
    case 'home':
      b = duplex(at, random, !!place.roof);
      name ??= 'Your home';
      break;
    case 'apartment': {
      const r = random();
      if (place.roof) {
        b = duplex(at, random, true);
        name ??= 'Penthouse';
      } else if (r < 0.45) {
        b = studio(at, random);
        name ??= 'Studio flat';
      } else {
        b = flat(at, random);
        name ??= 'Apartment';
      }
      break;
    }
    case 'house':
      if ((place.storeys ?? 1) >= 2) b = duplex(at, random, false);
      else b = random() < 0.35 ? studio(at, random) : flat(at, random);
      name ??= 'House';
      break;
    case 'office':
      b = offices(at, random);
      name ??= 'Offices';
      break;
    case 'hospital':
      b = hospital(at, random);
      name ??= 'Hospital';
      break;
    case 'gamecentre':
      b = gameCentre(at, random);
      name ??= 'Game centre';
      break;
    case 'eventcentre':
      b = eventCentre(at, random);
      name ??= 'Event centre';
      break;
    default:
      b = oneRoom(at, place.kind, random);
      name ??= ROOMS[place.kind]?.name ?? 'Room';
  }
  const { rooms, links } = b.layout();
  const front = b.world(0, b.d / 2 - 1.4);
  const interior: CityInterior = {
    kind: place.kind,
    name,
    building: place.building,
    door: place.door,
    entry: { x: front.x, y: place.y, z: front.z, heading: place.yaw + Math.PI },
    x: place.x,
    y: place.y,
    z: place.z,
    yaw: place.yaw,
    width: b.w,
    depth: b.d,
    levels: b.levels,
    rooms,
    links,
    spots: b.spots,
    stairs: b.flights,
    roof: b.roof ? { inside: b.roof } : undefined,
    pieces: b.pieces,
    shapes: b.shapes,
  };
  return { interior, colliders: b.colliders };
}

// ------------------------------------------------------------------ the one-room buildings

/** Town pack pieces by their old names (office and coffeehouse bits); everything else is Kenney's kit. */
const TOWN_PIECES = new Set(['file-cabinet', 'water-cooler', 'vending-machine', 'whiteboard', 'printer', 'office-chair', 'wall-art', 'cash-register', 'can-fridge', 'coffee-machine']);
const piece = (name: string) => (name.includes('/') ? name : TOWN_PIECES.has(name) ? `furniture/${name}` : `k/furniture/${name}`) as Furniture;
const DISHES = ['burger', 'pizza', 'salad', 'sandwich', 'pancakes', 'cake', 'hot-dog', 'croissant'].map((n) => `k/food/${n}`);
const SWEETS = ['donut-sprinkles', 'muffin', 'croissant', 'cake'].map((n) => `k/food/${n}`);

/** A one-room public building: its room, papered and floored, and laid out for what it is. */
function oneRoom(place: { x: number; y: number; z: number; yaw: number }, kind: InteriorKind, random: () => number): InteriorBuilder {
  const spec = ROOMS[kind] ?? ROOMS.shop!;
  const { width: w, depth: d } = spec;
  const b = new InteriorBuilder(place, w, d, 1, random, false);
  const room: PlanRoom = b.room(kind, 0, -w / 2, -d / 2, w / 2, d / 2, b.pick(spec.floors), b.pick(spec.walls));
  b.link(0, 0, d / 2, 1.4);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const put = (name: string, x: number, z: number, turn = 0, y = 0) => b.put(piece(name), 0, x, z, turn, y);
  const against = (name: string, wall: 'back' | 'left' | 'right' | 'front', along: number, y = 0) => b.against(piece(name), room, wall, along, y);
  const meal = (x: number, z: number, y: number, dishes: readonly string[] = DISHES) => {
    put('k/food/plate', x, z, random() * 6, y);
    put(pick(dishes), x, z, random() * 6, y + 0.02);
    put(random() < 0.5 ? 'k/food/soda' : 'k/food/cup-coffee', x + 0.25, z + 0.12, random() * 6, y);
  };
  const staff = (x: number, z: number, turn: number) => b.spot(0, x, z, turn, 'staff');
  const visitor = (x: number, z: number) => b.spot(0, x, z, random() * 6, 'visitor');
  put('rugDoormat', 0, d / 2 - 0.6);

  switch (kind) {
    case 'shop': {
      // Shelves round the walls, aisles in the middle, a counter with the till by the door, a fridge.
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
      staff(w / 2 - 0.9, 1.3, -Math.PI / 2);
      against('can-fridge', 'right', -2.3);
      for (const [x, z] of [[-3.8, 3.2], [-3.2, 3.2], [-3.5, 2.6]] as const) put('cardboardBoxClosed', x, z, random());
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      visitor(0, -0.2);
      break;
    }
    case 'cafe': {
      for (let z = -2.4; z < 0.8; z += 0.9) put('kitchenBar', w / 2 - 2, z, -Math.PI / 2);
      put('coffee-machine', w / 2 - 2, -1.6, Math.PI / 2, 0.88);
      put('cash-register', w / 2 - 2, 0.2, Math.PI / 2, 0.88);
      staff(w / 2 - 1.3, -1.0, -Math.PI / 2);
      against('kitchenFridgeLarge', 'right', -2.6);
      against('kitchenCabinet', 'right', -1.5);
      against('kitchenCoffeeMachine', 'right', -0.6, 0.94);
      against('kitchenCabinet', 'right', -0.6);
      for (const [x, z] of [[-3, -2], [-3, 1.4], [0, -2.2], [0, 1.4]] as const) {
        put('tableRound', x, z);
        put('chairCushion', x - 1, z, Math.PI / 2);
        put('chairCushion', x + 1, z, -Math.PI / 2);
        if (random() < 0.7) meal(x - 0.2, z, 0.77, SWEETS);
        if (random() < 0.5) visitor(x - 1.3, z + 0.6);
      }
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, -d / 2 + 0.5);
      against('can-fridge', 'back', 2.2);
      break;
    }
    case 'police': {
      // Desks in rows facing the door, each with a screen and chair; filing along the back wall.
      for (const z of [-2.2, 0.6]) {
        for (const x of [-4.2, -1.4, 1.4]) {
          put('desk', x, z, Math.PI);
          put('computerScreen', x + 0.2, z + 0.15, Math.PI, 0.81);
          put('computerKeyboard', x + 0.2, z - 0.15, Math.PI, 0.81);
          put('office-chair', x, z - 0.85);
        }
        staff(-1.4, z - 1.1, Math.PI);
      }
      for (let x = -w / 2 + 0.6; x < w / 2 - 3; x += 0.7) against('file-cabinet', 'back', x);
      against('water-cooler', 'right', -d / 2 + 0.6);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      // The front desk across the right of the door, a bench and a vending machine.
      for (let x = 2.2; x < w / 2 - 0.4; x += 0.9) put('kitchenBar', x, 2.6, Math.PI);
      put('computerScreen', 3.6, 2.6, Math.PI, 0.88);
      staff(3.6, 1.9, 0);
      against('vending-machine', 'right', 1.4);
      put('benchCushion', -3, d / 2 - 0.4, Math.PI);
      put('benchCushion', -4, d / 2 - 0.4, Math.PI);
      against('whiteboard', 'left', -1, 0.6);
      visitor(-3.5, 3.5);
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
        meal(x, 0.4, 0.69);
      }
      against('kitchenFridgeLarge', 'right', 0);
      against('kitchenSink', 'right', 1);
      against('kitchenStove', 'right', 1.9);
      put('loungeSofa', 2.4, 2.2, Math.PI);
      against('cabinetTelevision', 'front', -4.4);
      put('televisionModern', -4.4, d / 2 - 0.3, Math.PI, 0.65);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      staff(2.4, 1.2, Math.PI);
      staff(-2.5, 2.0, Math.PI);
      break;
    }
    case 'school': {
      // A classroom: the whiteboard and the teacher's desk at the back, pupils' desks facing them.
      against('whiteboard', 'back', 0, 0.6);
      put('desk', 3, -d / 2 + 1.8);
      put('chairDesk', 3, -d / 2 + 1.0);
      staff(1.5, -d / 2 + 1.4, 0);
      for (const z of [-1, 0.8, 2.6]) {
        for (const x of [-4.5, -1.5, 1.5, 4.5]) {
          put('table', x, z, Math.PI);
          put('chair', x - 0.45, z + 0.75, Math.PI);
          put('chair', x + 0.45, z + 0.75, Math.PI);
          put('books', x - 0.3, z, random(), 0.69);
        }
      }
      for (let z = -d / 2 + 1; z < 2; z += 0.86) against('bookcaseOpen', 'left', z);
      against('coatRack', 'right', 3.4, 1.4);
      put('pottedPlant', w / 2 - 0.4, -d / 2 + 0.5);
      for (let k = 0; k < 4; k++) visitor(-4 + k * 2.6, 2.0);
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
      for (const z of [-2, 2]) {
        against('pottedPlant', 'left', z);
        against('pottedPlant', 'right', z);
      }
      put('benchCushion', -3.5, d / 2 - 0.4, Math.PI);
      put('benchCushion', 3.5, d / 2 - 0.4, Math.PI);
      staff(0, -2.2, 0);
      visitor(2.5, 1.5);
      break;
    }
    case 'bank': {
      // Tellers behind a long counter across the room; desks for the clerks behind them.
      for (let x = -w / 2 + 0.5; x < w / 2 - 0.4; x += 0.9) if (Math.abs(x - 4.1) > 0.6) put('kitchenBar', x, -0.6, Math.PI);
      for (const x of [-4, -1, 2]) {
        put('computerScreen', x, -0.65, Math.PI, 0.88);
        staff(x, -1.3, 0);
      }
      for (const x of [-3.5, 0, 3.5]) {
        put('desk', x, -d / 2 + 1.2, Math.PI);
        put('office-chair', x, -d / 2 + 0.6, Math.PI);
      }
      put('benchCushion', -3, d / 2 - 0.4, Math.PI);
      put('benchCushion', -4, d / 2 - 0.4, Math.PI);
      against('water-cooler', 'left', 2);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, -0.2);
      visitor(-1, 0.6);
      visitor(2, 0.6);
      break;
    }
    case 'post': {
      for (let x = -1.8; x < 2.6; x += 0.9) put('kitchenBar', x, 0, Math.PI);
      put('cash-register', 0, 0, Math.PI, 0.88);
      staff(0, -0.8, 0);
      for (let x = -w / 2 + 0.5; x < -1; x += 0.5) {
        for (let k = 0; k < 3; k++) put(random() < 0.5 ? 'cardboardBoxClosed' : 'cardboardBoxOpen', x, -d / 2 + 0.4 + k * 0.85, random() * 0.3);
      }
      for (let x = 1; x < w / 2 - 0.4; x += 0.7) against('file-cabinet', 'back', x);
      put('benchCushion', 3.5, d / 2 - 0.4, Math.PI);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      visitor(0.5, 1.4);
      break;
    }
    case 'library': {
      // Rows of shelves at the back, reading tables with lamps in front.
      for (const z of [-d / 2 + 0.3, -2.4]) for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += 0.86) put('bookcaseOpen', x, z + 0.27, z < -3 ? 0 : Math.PI);
      for (let x = -w / 2 + 0.6; x < -1; x += 0.86) put('bookcaseOpen', x, -0.6, 0);
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
      staff(-2.5, 3.0, Math.PI);
      visitor(3.5, 1.8);
      break;
    }
    case 'market': {
      // Freezers along the back, an island of shelves back to back, bags down the left, the fruit and
      // bread by the door and the checkout beside it, trolleys waiting.
      for (let x = -6; x < 4; x += 2.5) against('k/market/freezers-standing', 'back', x);
      against('k/market/bottle-return', 'back', 5.4);
      for (const z of [-2.6, -0.4]) against('k/market/shelf-bags', 'left', z);
      against('k/market/freezer', 'right', -2);
      for (let x = -3, k = 0; k < 4; x += 2, k++) {
        put(pick(['k/market/shelf-boxes', 'k/market/shelf-bags'] as const), x, -1.9, Math.PI);
        put(pick(['k/market/shelf-boxes', 'k/market/shelf-bags'] as const), x, -0.15);
      }
      put('k/market/display-fruit', -5, 3.4);
      put('k/market/display-bread', -3.1, 3.4);
      put('k/market/cash-register', 4, 3.3, Math.PI);
      staff(4, 2.0, 0);
      for (const x of [6.0, 6.6]) put('k/market/shopping-cart', x, 4.3, Math.PI / 2);
      put('k/market/shopping-basket', -w / 2 + 0.6, d / 2 - 0.6);
      visitor(-1, 1.6);
      visitor(1.5, -3.8);
      break;
    }
    case 'diner': {
      // A counter with stools across the back, the kitchen behind it, booths down both sides, and
      // something on every table.
      for (let x = -4.5; x < 2.6; x += 0.9) {
        put('kitchenBar', x, -2.6, Math.PI);
        put('stoolBar', x, -1.85, Math.PI);
        if (random() < 0.35) meal(x, -2.6, 0.88);
      }
      put('kitchenBarEnd', 3.05, -2.6, Math.PI);
      for (const [n, x] of [['kitchenFridgeLarge', -5.2], ['kitchenStove', -3.8], ['kitchenStove', -2.9], ['kitchenSink', -2.0], ['kitchenCabinet', -1.1], ['kitchenCabinet', -0.2]] as const) against(n, 'back', x);
      put('kitchenCoffeeMachine', -1.1, -d / 2 + 0.45, 0, 0.94);
      put('kitchenMicrowave', -0.2, -d / 2 + 0.45, 0, 0.94);
      staff(-2.0, -3.6, 0);
      staff(1.0, -3.5, 0);
      for (const x of [-w / 2 + 1.5, w / 2 - 1.5]) {
        for (const z of [0.3, 2.8]) {
          put('table', x, z);
          put('benchCushion', x, z - 0.8);
          put('benchCushion', x, z + 0.8, Math.PI);
          meal(x - 0.4, z - 0.15, 0.69);
          if (random() < 0.6) meal(x + 0.4, z + 0.15, 0.69);
        }
      }
      against('speaker', 'right', -3.3);
      put('pottedPlant', w / 2 - 0.4, d / 2 - 0.5);
      put('pottedPlant', -w / 2 + 0.4, d / 2 - 0.5);
      visitor(0, 1.5);
      break;
    }
  }
  b.finish();
  return b;
}

// ------------------------------------------------------------------ doorways

/** Somewhere E takes you: into a building, back out, up to the roof or back down. */
export interface Doorway {
  interior: CityInterior;
  /** Inside the building's plan (not on the street or the roof). */
  inside: boolean;
  /** "to go into the hospital", "to go up to the roof"... */
  label: string;
  /** Where you come out. */
  to: Stand;
}

/** The doorway within `reach` of a point, if any. */
export function interiorDoorAt(interiors: readonly CityInterior[], x: number, y: number, z: number, reach = 2.2): Doorway | undefined {
  const near = (s: { x: number; z: number }, r = reach) => Math.hypot(x - s.x, z - s.z) < r;
  for (const interior of interiors) {
    const { entry, door, roof } = interior;
    if (Math.abs(y - entry.y) < 2 && near(entry)) {
      return { interior, inside: true, label: 'to go out', to: { x: door.x, y: 0.15, z: door.z, heading: door.heading } };
    }
    if (y > -1 && y < 2.5 && near(door)) {
      const called = interior.kind === 'home' ? 'your home' : interior.name;
      return { interior, inside: false, label: `to go into ${called}`, to: { ...entry, y: entry.y + 0.05 } };
    }
    if (roof?.outside) {
      if (Math.abs(y - roof.inside.y) < 2 && near(roof.inside, 1.7)) return { interior, inside: true, label: 'to go up to the roof', to: { ...roof.outside, y: roof.outside.y + 0.05 } };
      if (Math.abs(y - roof.outside.y) < 2 && near(roof.outside, 1.8)) return { interior, inside: false, label: 'to go back downstairs', to: { ...roof.inside, y: roof.inside.y + 0.05 } };
    }
  }
  return undefined;
}

/**
 * Someone under the town who isn't standing in any building's plan any more (walked out somehow, or
 * fell): where to put them back, outside the front door of the building they were nearest. Undefined
 * while they're where they should be.
 */
export function strayedFromInterior(interiors: readonly CityInterior[], x: number, y: number, z: number): Stand | undefined {
  if (y > -5 || !interiors.length) return undefined;
  let nearest = interiors[0];
  let best = Infinity;
  for (const interior of interiors) {
    const dx = x - interior.x;
    const dz = z - interior.z;
    // Into the plan's own frame (mirroring only flips x, which the test below doesn't mind).
    const c = Math.cos(interior.yaw);
    const s = Math.sin(interior.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) <= interior.width / 2 + 0.3 && Math.abs(lz) <= interior.depth / 2 + 0.3 && y > interior.y - 2) return undefined;
    const d = dx * dx + dz * dz;
    if (d < best) {
      best = d;
      nearest = interior;
    }
  }
  const { door } = nearest;
  return { x: door.x, y: 0.15, z: door.z, heading: door.heading };
}

/** The interior (and level) a point is inside, if any: for the renderer and the people about. */
export function interiorAt(interiors: readonly CityInterior[], x: number, y: number, z: number): { interior: CityInterior; level: number } | undefined {
  for (const interior of interiors) {
    const r = Math.max(interior.width, interior.depth) / 2 + 1;
    if (Math.abs(x - interior.x) > r || Math.abs(z - interior.z) > r) continue;
    const level = Math.floor((y - interior.y + 0.6) / INTERIOR_HEIGHT);
    if (level < -1 || level > interior.levels) continue;
    return { interior, level: Math.max(0, Math.min(interior.levels - 1, level)) };
  }
  return undefined;
}
