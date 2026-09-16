/**
 * Turning a menu item into a stock-photo search, and choosing between the
 * results. Kept separate from the network so it can be tested directly.
 */

/**
 * A dish name is rarely a good search term on its own. "Cold Brew" returns
 * cold-weather photography; "Club Sandwich" returns nightclubs. These map the
 * seed menu onto queries that actually describe the food.
 */
const QUERY_OVERRIDES = {
  'espresso': 'espresso shot cup coffee',
  'cappuccino': 'cappuccino latte art cup',
  'cafe latte': 'cafe latte glass milk coffee',
  'flat white': 'flat white coffee cup cafe',
  'masala chai': 'masala chai indian tea',
  'iced americano': 'iced americano coffee glass ice',
  'cold brew': 'cold brew iced coffee glass',
  'iced mocha': 'iced mocha chocolate coffee glass',
  'fresh lime soda': 'lime soda drink glass mint',
  'avocado toast': 'avocado toast sourdough breakfast',
  'masala omelette': 'omelette eggs breakfast plate',
  'pancake stack': 'pancake stack maple syrup breakfast',
  'chicken sausage shakshuka': 'shakshuka eggs tomato skillet',
  'grilled cheese sandwich': 'grilled cheese sandwich melted',
  'peri peri chicken burger': 'grilled chicken burger spicy',
  'paneer tikka wrap': 'paneer tikka wrap roll indian',
  'club sandwich': 'club sandwich triple decker plate',
  'butter croissant': 'butter croissant pastry bakery',
  'pain au chocolat': 'pain au chocolat chocolate pastry',
  'banana walnut cake': 'banana walnut cake slice',
  'blueberry cheesecake': 'blueberry cheesecake slice',
  'chocolate chip cookie': 'chocolate chip cookies',
  'peri peri fries': 'seasoned french fries bowl',
  'garlic bread': 'garlic bread cheese baked',
  'chicken wings': 'chicken wings sauce plate',
};

/** Words that describe the business, not the food. */
const NOISE = /\b(special|signature|house|classic|regular|large|small|combo|meal|our|the|new)\b/gi;

/** Build the query for an item, preferring an explicit override. */
export function searchQuery(item) {
  const name = String(item?.name ?? '').trim();
  if (!name) return '';

  const override = QUERY_OVERRIDES[name.toLowerCase()];
  if (override) return override;

  const cleaned = name.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  // The category disambiguates a bare dish name ("Old Monk" in Drinks).
  const context = String(item?.category_name ?? '').toLowerCase();
  const hint = /coffee|brew|drink|beverage|tea/.test(context) ? 'drink'
    : /bakery|dessert|cake/.test(context) ? 'bakery'
      : 'food';
  return `${cleaned || name} ${hint}`.trim();
}

/**
 * Choose a photo from a Pexels result set.
 *
 * Skips anything already used for another item — two dishes sharing a photo
 * looks like a bug to a guest — and anything too panoramic to survive the
 * 4:3 crop the menu card applies.
 */
export function pickPhoto(photos, { used = new Set() } = {}) {
  if (!Array.isArray(photos)) return null;

  const usable = photos.filter((p) => {
    if (!p || used.has(String(p.id))) return false;
    if (!p.src?.large2x && !p.src?.large) return false;
    if (!p.width || !p.height) return false;
    const ratio = p.width / p.height;
    // Portrait crops badly in a landscape card; ultra-wide loses the dish.
    return ratio >= 1.05 && ratio <= 2.1 && p.width >= 900;
  });

  return usable[0] ?? null;
}

/** The provenance recorded against the item. */
export function creditFor(photo) {
  return {
    source: 'pexels',
    photographer: photo.photographer ?? null,
    photographer_url: photo.photographer_url ?? null,
    source_url: photo.url ?? null,
    license: 'Pexels License — free for commercial use, no attribution required',
    imported_at: new Date().toISOString(),
  };
}
