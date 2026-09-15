/**
 * Menu photography is the exception, not the rule — most cafes launch with a
 * spreadsheet of names and prices. So every item gets a generated tile: a
 * gradient and a glyph chosen from what the dish actually is. It reads as a
 * deliberate design rather than a missing image, and a real `image_url`
 * always wins when the restaurant uploads one.
 */

interface Art { emoji: string; from: string; to: string; tint: string }

const PALETTES = {
  coffee: { from: 'from-amber-100', to: 'to-orange-200', tint: 'text-amber-900' },
  cold: { from: 'from-sky-100', to: 'to-cyan-200', tint: 'text-sky-900' },
  bakery: { from: 'from-rose-100', to: 'to-amber-100', tint: 'text-rose-900' },
  savoury: { from: 'from-orange-100', to: 'to-red-200', tint: 'text-red-900' },
  fresh: { from: 'from-emerald-100', to: 'to-lime-200', tint: 'text-emerald-900' },
  sweet: { from: 'from-fuchsia-100', to: 'to-pink-200', tint: 'text-fuchsia-900' },
  neutral: { from: 'from-ink-100', to: 'to-ink-200', tint: 'text-ink-600' },
} as const;

/** Longest match wins, so "iced coffee" beats a bare "coffee". */
const RULES: [string[], string, keyof typeof PALETTES][] = [
  [['cold brew', 'iced coffee', 'iced americano', 'iced latte'], '🧊', 'cold'],
  [['iced mocha', 'mocha'], '🍫', 'cold'],
  [['cappuccino', 'latte', 'flat white', 'espresso', 'americano', 'coffee', 'macchiato'], '☕', 'coffee'],
  [['chai', 'tea', 'matcha'], '🍵', 'coffee'],
  [['lime soda', 'lemonade', 'soda', 'juice', 'smoothie', 'shake', 'mojito'], '🥤', 'cold'],
  [['croissant', 'pain au chocolat', 'danish', 'bun'], '🥐', 'bakery'],
  [['cheesecake', 'cake', 'brownie', 'pastry', 'tart'], '🍰', 'sweet'],
  [['cookie', 'biscuit'], '🍪', 'bakery'],
  [['pancake', 'waffle', 'french toast'], '🥞', 'bakery'],
  [['avocado'], '🥑', 'fresh'],
  [['garlic bread', 'bread', 'toast', 'sourdough', 'bagel'], '🍞', 'bakery'],

  [['omelette', 'shakshuka', 'scrambled', 'benedict', 'egg'], '🍳', 'savoury'],
  [['burger'], '🍔', 'savoury'],
  [['sandwich', 'club', 'panini'], '🥪', 'savoury'],
  [['wrap', 'roll', 'burrito', 'taco'], '🌯', 'savoury'],
  [['pizza'], '🍕', 'savoury'],
  [['noodle', 'pasta', 'spaghetti', 'ramen'], '🍜', 'savoury'],
  [['rice', 'biryani', 'pulao'], '🍚', 'savoury'],
  [['wings', 'chicken', 'tikka', 'kebab', 'grill'], '🍗', 'savoury'],
  [['fries', 'chips', 'wedges'], '🍟', 'savoury'],
  [['salad', 'bowl', 'greens'], '🥗', 'fresh'],
  [['soup', 'broth'], '🍲', 'savoury'],
  [['paneer', 'tofu', 'cheese'], '🧀', 'savoury'],
  [['ice cream', 'gelato', 'sundae'], '🍨', 'sweet'],
  [['dumpling', 'momo', 'bao'], '🥟', 'savoury'],
];

const FALLBACK_BY_TYPE: Record<string, [string, keyof typeof PALETTES]> = {
  VEG: ['🥗', 'fresh'],
  VEGAN: ['🌱', 'fresh'],
  EGG: ['🍳', 'savoury'],
  NON_VEG: ['🍗', 'savoury'],
};

export function foodArt(name: string, foodType = 'VEG'): Art {
  const haystack = name.toLowerCase();

  for (const [keywords, emoji, palette] of RULES) {
    if (keywords.some((k) => haystack.includes(k))) {
      return { emoji, ...PALETTES[palette] };
    }
  }

  const [emoji, palette] = FALLBACK_BY_TYPE[foodType] ?? ['🍽️', 'neutral'];
  return { emoji, ...PALETTES[palette] };
}
