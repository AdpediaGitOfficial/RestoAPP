/**
 * Menu photography is the exception, not the rule — most cafes launch with a
 * spreadsheet of names and prices. So every item gets a generated tile.
 *
 * A giant emoji reads as a missing image. These are quiet, desaturated
 * gradients with a line-art glyph, so a menu with no photography still looks
 * composed. A real `image_url` always wins when the restaurant uploads one.
 */

export type Glyph =
  | 'cup' | 'iced' | 'bottle' | 'croissant' | 'cake' | 'cookie' | 'stack'
  | 'bread' | 'egg' | 'burger' | 'sandwich' | 'wrap' | 'pizza' | 'noodles'
  | 'bowl' | 'drumstick' | 'fries' | 'salad' | 'pot' | 'cheese' | 'scoop'
  | 'dumpling' | 'plate';

interface Art { glyph: Glyph; from: string; to: string; ink: string; angle: number }

/** Muted, low-chroma pairs — they sit behind type without competing with it. */
const PALETTES = {
  coffee: { from: '#F3E7DA', to: '#E4CDB4', ink: '#8A6647' },
  cold: { from: '#E3EDF4', to: '#C9DEEC', ink: '#4A748F' },
  bakery: { from: '#F6E9DD', to: '#EBD5C2', ink: '#9A6E4E' },
  savoury: { from: '#F6E4DC', to: '#EDCBBC', ink: '#96543D' },
  fresh: { from: '#E6EFE2', to: '#CEE2C7', ink: '#527048' },
  sweet: { from: '#F3E6EC', to: '#E6CCD8', ink: '#8C5670' },
  neutral: { from: '#EEEEF1', to: '#DEDFE3', ink: '#6B6E7A' },
} as const;

/** First match wins, so specific dishes are listed before their carriers. */
const RULES: [string[], Glyph, keyof typeof PALETTES][] = [
  [['cold brew', 'iced coffee', 'iced americano', 'iced latte', 'iced mocha'], 'iced', 'cold'],
  [['cappuccino', 'latte', 'flat white', 'espresso', 'americano', 'macchiato', 'coffee'], 'cup', 'coffee'],
  [['chai', 'tea', 'matcha'], 'cup', 'coffee'],
  [['lime soda', 'lemonade', 'soda', 'juice', 'smoothie', 'shake', 'mojito'], 'bottle', 'cold'],
  [['croissant', 'pain au chocolat', 'danish'], 'croissant', 'bakery'],
  [['cheesecake', 'cake', 'brownie', 'tart', 'pastry'], 'cake', 'sweet'],
  [['cookie', 'biscuit'], 'cookie', 'bakery'],
  [['pancake', 'waffle', 'french toast'], 'stack', 'bakery'],
  [['avocado', 'salad', 'greens'], 'salad', 'fresh'],
  [['garlic bread', 'bread', 'toast', 'sourdough', 'bagel', 'bun'], 'bread', 'bakery'],
  [['omelette', 'shakshuka', 'scrambled', 'benedict', 'egg'], 'egg', 'savoury'],
  [['burger'], 'burger', 'savoury'],
  [['sandwich', 'club', 'panini'], 'sandwich', 'savoury'],
  [['wrap', 'roll', 'burrito', 'taco'], 'wrap', 'savoury'],
  [['pizza'], 'pizza', 'savoury'],
  [['noodle', 'pasta', 'spaghetti', 'ramen'], 'noodles', 'savoury'],
  [['rice', 'biryani', 'pulao', 'bowl'], 'bowl', 'savoury'],
  [['wings', 'chicken', 'tikka', 'kebab', 'grill'], 'drumstick', 'savoury'],
  [['fries', 'chips', 'wedges'], 'fries', 'savoury'],
  [['soup', 'broth', 'curry'], 'pot', 'savoury'],
  [['paneer', 'tofu', 'cheese'], 'cheese', 'savoury'],
  [['ice cream', 'gelato', 'sundae'], 'scoop', 'sweet'],
  [['dumpling', 'momo', 'bao'], 'dumpling', 'savoury'],
];

const BY_TYPE: Record<string, [Glyph, keyof typeof PALETTES]> = {
  VEG: ['salad', 'fresh'],
  VEGAN: ['salad', 'fresh'],
  EGG: ['egg', 'savoury'],
  NON_VEG: ['drumstick', 'savoury'],
};

/** Stable small integer from a name, so a dish always gets the same tile. */
function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Nudge a hex colour's lightness, keeping it inside the palette's family. */
function shift(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function foodArt(name: string, foodType = 'VEG'): Art {
  const haystack = name.toLowerCase();

  let glyph: Glyph = 'plate';
  let palette: keyof typeof PALETTES = 'neutral';
  const matched = RULES.find(([keywords]) => keywords.some((k) => haystack.includes(k)));
  if (matched) {
    [, glyph, palette] = matched;
  } else {
    [glyph, palette] = BY_TYPE[foodType] ?? ['plate', 'neutral'];
  }

  // Five coffees in a row with the same tile looks like a template. Vary the
  // tone and angle per dish so a category reads as a set, not a repeat.
  const seed = hash(name);
  const tone = [-8, 0, 7, 14][seed % 4];
  const base = PALETTES[palette];

  return {
    glyph,
    from: shift(base.from, tone),
    to: shift(base.to, tone),
    ink: base.ink,
    angle: 130 + (seed % 5) * 12,
  };
}

/** Line art on a 48px grid, drawn with the tile's own ink colour. */
export const GLYPH_PATHS: Record<Glyph, string> = {
  cup: 'M11 17h20v12a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8V17zM31 20h4a5 5 0 0 1 0 10h-4M16 11c0-2 2-2 2-4M24 11c0-2 2-2 2-4',
  iced: 'M13 16h22l-2.5 20a5 5 0 0 1-5 4.5h-7A5 5 0 0 1 15.5 36L13 16zM17 23h14M27 16l6-9M18 27h6v6h-6zM26 30h5v5h-5z',
  bottle: 'M14 14h20l-2.5 24a4 4 0 0 1-4 3.5h-7a4 4 0 0 1-4-3.5L14 14zM16 23h16M27 14l5-8',
  croissant: 'M7 35C8 19 19 8 37 7c2 15-11 27-30 28zM16 31c3-5 5-10 6-15M24 29c2-4 3-8 4-12M9 34c2-3 4-7 5-11',
  cake: 'M10 24h28v14a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V24zM10 30h28M24 24V15M20 12l4-4 4 4',
  cookie: 'M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32zM19 19v.01M28 17v.01M22 28v.01M30 26v.01',
  stack: 'M10 16h28M10 24h28M10 32h28M14 16v16M34 16v16M24 12v-4',
  bread: 'M10 20c0-5 6-8 14-8s14 3 14 8v14a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V20zM17 20v17',
  egg: 'M24 8c7 0 12 10 12 18a12 12 0 0 1-24 0c0-8 5-18 12-18zM24 20a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
  burger: 'M10 20c0-6 6-10 14-10s14 4 14 10H10zM10 26h28M9 32h30a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5z',
  sandwich: 'M8 18 24 10l16 8-16 8-16-8zM8 26l16 8 16-8M8 32l16 8 16-8',
  wrap: 'M12 36 30 10c4 2 7 6 7 11 0 9-9 17-19 17l-6-2zM18 30c5-3 9-8 10-13',
  pizza: 'M24 8 40 38a36 36 0 0 1-32 0L24 8zM20 26v.01M28 26v.01M24 33v.01',
  noodles: 'M10 20h28v4a14 14 0 0 1-28 0v-4zM14 20c0-6 3-10 6-12M22 20c0-6 3-10 6-12M30 20c0-5 2-8 4-10',
  bowl: 'M8 22h32c0 10-7 17-16 17S8 32 8 22zM14 17c2-3 6-3 8 0M26 17c2-3 6-3 8 0',
  drumstick: 'M28 10a10 10 0 0 1 8 16c-2 3-6 4-9 6l-7 7-4-4 7-7c2-3 3-7 6-9a10 10 0 0 1-1-9zM15 32l-5 5 3 3 5-5',
  fries: 'M14 22h20l-2 15a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3l-2-15zM18 22V10M24 22V7M30 22V12',
  salad: 'M8 24h32c0 9-7 16-16 16S8 33 8 24zM16 24c0-6 4-10 8-10M24 24c0-7 5-11 10-11M14 20c-2-3-1-6 1-8',
  pot: 'M10 20h28v11a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V20zM6 24h4M38 24h4M18 14c0-3 3-3 3-6M27 14c0-3 3-3 3-6',
  cheese: 'M8 22 30 12l10 10v14H8V22zM8 22h32M18 28v.01M28 30v.01',
  scoop: 'M24 10a10 10 0 0 1 10 10H14a10 10 0 0 1 10-10zM14 22l10 18 10-18',
  dumpling: 'M10 30c0-8 6-14 14-14s14 6 14 14H10zM10 30c0 4 6 6 14 6s14-2 14-6M17 23c2-2 4-2 6 0M27 22c2-2 4-2 6 0',
  plate: 'M24 8a16 16 0 1 0 0 32 16 16 0 0 0 0-32zM24 16a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
};
