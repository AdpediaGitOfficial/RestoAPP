'use client';

import { foodArt } from '@/lib/foodArt';

/**
 * The visual for a menu item: the restaurant's photo when there is one,
 * otherwise a generated gradient tile. Same shape either way, so the grid
 * never goes ragged when only half the menu has photography.
 */
export default function FoodTile({ name, foodType, imageUrl, className = '', size = 'md' }: {
  name: string;
  foodType?: string;
  imageUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const art = foodArt(name, foodType);
  const glyph = { sm: 'text-2xl', md: 'text-5xl', lg: 'text-6xl' }[size];

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${art.from} ${art.to} ${className}`}
    >
      <span className={`${glyph} ${art.tint} drop-shadow-sm`}>{art.emoji}</span>
    </div>
  );
}
