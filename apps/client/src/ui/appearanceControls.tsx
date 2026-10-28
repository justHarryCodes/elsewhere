import { useState } from 'react';
import {
  CLOTH_COLORS,
  CLOTHING,
  HAIR_COLORS,
  HAIR_STYLES,
  HUMAN_BODIES,
  OUTFITS,
  SKIN_TONES,
  outfitClothes,
  randomAppearance,
  wearClothing,
  type ClothingItem,
  type ClothingPick,
  type ClothingSlot,
  type HairColor,
  type HairStyle,
  type HumanAppearance,
  type HumanBody,
  type Outfit,
  type SkinTone,
} from '@game/shared';

// Look controls shared by the sandboxes: body and hair, skin and colour swatches, and the clothes panel.

// The skin texture averages this colour; each tone tints it.
const BASE_SKIN = [156, 110, 78];
export function skinSwatch(tone: SkinTone) {
  const tint = SKIN_TONES[tone].tint;
  const channel = (i: number) => Math.min(255, Math.round(BASE_SKIN[i] * tint[i]));
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

const SLOT_ORDER: { slots: ClothingSlot[]; label: string }[] = [
  { slots: ['top', 'full'], label: 'Tops & dresses' },
  { slots: ['bottom'], label: 'Bottoms' },
  { slots: ['shoes'], label: 'Shoes' },
  { slots: ['hands', 'knees', 'back', 'head', 'waist', 'wrists', 'neck'], label: 'Accessories' },
];
const ZONE_LABELS = ['Main', 'Trim', 'Detail'] as const;

/** Outfits, mix-and-match pieces (click to wear or take off) and colours for the selected piece. */
export function ClothesPanel({
  body,
  appearance,
  onChange,
}: {
  body: HumanBody;
  appearance: HumanAppearance;
  onChange: (change: Partial<HumanAppearance>) => void;
}) {
  const [selected, setSelected] = useState<ClothingItem | null>(null);
  const worn = new Map(appearance.clothes.map((pick) => [pick.item, pick]));
  const editing = selected && worn.get(selected);
  const setClothes = (clothes: ClothingPick[]) => onChange({ clothes });
  const toggle = (item: ClothingItem) => {
    if (worn.has(item)) {
      if (selected !== item) return setSelected(item);
      setSelected(null);
      return setClothes(appearance.clothes.filter((pick) => pick.item !== item));
    }
    setSelected(item);
    setClothes(wearClothing(appearance.clothes, { item }));
  };
  const recolour = (zone: number, colour: string) => {
    if (!editing) return;
    const colors = [...(editing.colors ?? CLOTHING[editing.item].colors)] as [string, string, string];
    colors[zone] = colour;
    setClothes(appearance.clothes.map((pick) => (pick.item === editing.item ? { ...pick, colors } : pick)));
  };

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Clothes</h2>
        <button
          type="button"
          onClick={(event) => {
            const look = randomAppearance(body, Math.floor(Math.random() * 2 ** 31));
            setSelected(null);
            onChange({ clothes: look.clothes });
            event.currentTarget.blur();
          }}
          className="rounded-md bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
        >
          Shuffle
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(OUTFITS) as Outfit[]).map((outfit) => (
          <button
            key={outfit}
            type="button"
            onClick={(event) => {
              setSelected(null);
              setClothes(outfitClothes(outfit));
              event.currentTarget.blur();
            }}
            className="rounded-md bg-indigo-950 px-2 py-0.5 text-xs text-indigo-200 hover:bg-indigo-900"
          >
            {OUTFITS[outfit].label}
          </button>
        ))}
      </div>
      {SLOT_ORDER.map(({ slots, label }) => (
        <div key={label} className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">{label}</span>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CLOTHING) as ClothingItem[])
              .filter((item) => (slots as string[]).includes(CLOTHING[item].slot))
              .map((item) => {
                const pick = worn.get(item);
                const colour = (pick?.colors ?? CLOTHING[item].colors)[0];
                return (
                  <button
                    key={item}
                    type="button"
                    title={pick ? (selected === item ? 'Click again to take off' : 'Click to recolour') : 'Click to wear'}
                    onClick={(event) => {
                      toggle(item);
                      event.currentTarget.blur();
                    }}
                    className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                      pick ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    } ${selected === item ? 'ring-2 ring-indigo-400' : ''}`}
                  >
                    {pick && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} />}
                    {CLOTHING[item].label}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      {editing && (
        <div className="flex flex-col gap-1 rounded-md bg-slate-950/60 p-2">
          <span className="text-xs font-semibold text-slate-300">{CLOTHING[editing.item].label}</span>
          {ZONE_LABELS.map((zoneLabel, zone) => (
            <Swatches
              key={zoneLabel}
              label={zoneLabel}
              options={CLOTH_COLORS.map((colour) => ({ key: colour, label: colour, colour }))}
              value={(editing.colors ?? CLOTHING[editing.item].colors)[zone]}
              onChange={(colour) => recolour(zone, colour)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function Swatches<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: T; label: string; colour: string }[];
  value: T | undefined;
  onChange: (option: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={(event) => {
              onChange(option.key);
              event.currentTarget.blur();
            }}
            className={`h-6 w-6 rounded-full border-2 ${value === option.key ? 'border-indigo-400' : 'border-slate-700'}`}
            style={{ backgroundColor: option.colour }}
          />
        ))}
      </div>
    </div>
  );
}

/** Body, hairstyle, skin tone, hair colour and (on male bodies) a beard. */
export function CharacterControls({
  body,
  appearance,
  onBody,
  onChange,
}: {
  body: HumanBody;
  appearance: HumanAppearance;
  onBody: (body: HumanBody) => void;
  onChange: (change: Partial<HumanAppearance>) => void;
}) {
  const select = 'min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Character</h2>
      <div className="flex gap-2">
        <select value={body} onChange={(e) => onBody(e.target.value as HumanBody)} className={select}>
          {(Object.keys(HUMAN_BODIES) as HumanBody[]).map((b) => (
            <option key={b} value={b}>
              {HUMAN_BODIES[b].label}
            </option>
          ))}
        </select>
        <select value={appearance.hair} onChange={(e) => onChange({ hair: e.target.value as HairStyle })} className={select}>
          {(Object.keys(HAIR_STYLES) as HairStyle[]).map((hair) => (
            <option key={hair} value={hair}>
              {HAIR_STYLES[hair].label}
            </option>
          ))}
        </select>
      </div>
      <Swatches
        label="Skin"
        options={(Object.keys(SKIN_TONES) as SkinTone[]).map((key) => ({ key, label: SKIN_TONES[key].label, colour: skinSwatch(key) }))}
        value={appearance.skin}
        onChange={(skin) => onChange({ skin })}
      />
      <Swatches
        label="Hair colour"
        options={(Object.keys(HAIR_COLORS) as HairColor[]).map((key) => ({ key, label: HAIR_COLORS[key].label, colour: HAIR_COLORS[key].hex }))}
        value={appearance.hairColor}
        onChange={(hairColor) => onChange({ hairColor })}
      />
      {HUMAN_BODIES[body].base === 'male' && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={appearance.beard} onChange={(e) => onChange({ beard: e.target.checked })} />
          Beard
        </label>
      )}
    </section>
  );
}
