/**
 * The interface icon set. Emoji render differently on every device, sit off
 * the baseline and cannot inherit weight or colour — using them as UI icons
 * is the fastest way to make a product look unfinished. These are one
 * consistent 24px grid, 1.6 stroke, currentColor.
 */
export type IconName =
  | 'search' | 'sliders' | 'plus' | 'minus' | 'check' | 'close' | 'chevronRight'
  | 'chevronDown' | 'arrowLeft' | 'pencil' | 'trash' | 'clock' | 'bell' | 'table'
  | 'receipt' | 'sparkle' | 'flame' | 'tray' | 'send' | 'cash' | 'card' | 'phone'
  | 'wallet' | 'handshake' | 'info' | 'alert' | 'star' | 'leaf' | 'plate' | 'user';

const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6M11 4a7 7 0 0 1 4.2 12.6',
  sliders: 'M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4M16 5v4M8 10v4M14 15v4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  close: 'M6 6l12 12M18 6L6 18',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  arrowLeft: 'M19 12H5m0 0 6-6m-6 6 6 6',
  pencil: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM15 6l3 3',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 0 1-3.4 0',
  table: 'M3 9h18M5 9v11M19 9v11M4 5h16l1 4H3l1-4z',
  receipt: 'M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3H5zM9 8h6M9 12h6',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
  flame: 'M12 21c3.6 0 6-2.4 6-5.6 0-4.3-4.6-6.2-3.7-10.9C10.3 6.4 6.6 8.8 6.6 14c0 3.8 2.4 7 5.4 7zM12 21c1.7 0 2.8-1.2 2.8-2.7 0-2-2.2-2.9-1.7-5.1-2 .9-3.7 2-3.7 4.5 0 1.8 1.1 3.3 2.6 3.3z',
  tray: 'M3 13h5l1.5 3h5L16 13h5M4.5 13 6 5h12l1.5 8v6h-15v-6z',
  send: 'M21 4 3 10.5l7 3 3 7L21 4z',
  cash: 'M3 7h18v10H3V7zm9 5a2.5 2.5 0 1 0 0-.1M6 10v.01M18 14v.01',
  card: 'M3 7h18v10H3V7zm0 4h18M7 15h3',
  phone: 'M8 3h8v18H8V3zm3 15h2',
  wallet: 'M4 7h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4V7zm0 0V5h11M16 13h.01',
  handshake: 'M8 13l3 3 2-2 3 3M3 10l4-4 4 2 2-1 4 2 4-1',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.01',
  alert: 'M12 3 2 20h20L12 3zM12 10v4M12 17v.01',
  star: 'M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8L12 3.5z',
  leaf: 'M4 20C4 10 11 4 20 4c0 9-6 16-16 16zM4 20c3-4 6-6 10-8',
  plate: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
};

const FILLED = new Set<IconName>(['star', 'sparkle']);

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.6, filled }: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
}) {
  const solid = filled ?? FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
