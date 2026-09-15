'use client';

import { foodArt, GLYPH_PATHS } from '@/lib/foodArt';

/**
 * The visual for a menu item: the restaurant's photo when there is one,
 * otherwise a generated tile. Same shape either way, so the grid never goes
 * ragged when only half the menu has photography.
 */
export default function FoodTile({ name, foodType, imageUrl, className = '', size = 'md' }: {
  name: string;
  foodType?: string;
  imageUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
    );
  }

  const art = foodArt(name, foodType);
  // A constant stroke width disappears on a 44px thumbnail, so it scales
  // inversely with the tile.
  const { scale, stroke } = { sm: { scale: 0.58, stroke: 2.6 }, md: { scale: 0.42, stroke: 1.8 }, lg: { scale: 0.36, stroke: 1.6 } }[size];

  return (
    <div
      aria-hidden
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: `linear-gradient(${art.angle}deg, ${art.from} 0%, ${art.to} 100%)` }}
    >
      {/* A soft highlight keeps the flat gradient from looking like a swatch. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 22% 12%, rgba(255,255,255,0.55), transparent 60%)' }}
      />
      <svg
        viewBox="0 0 48 48"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: `${scale * 100}%`, color: art.ink, opacity: 0.72 }}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={GLYPH_PATHS[art.glyph]} />
      </svg>
    </div>
  );
}
