/**
 * All money in this app is an integer count of minor units (paise / cents).
 * Never use floats for totals — only at the display edge.
 */
export const percentOf = (amount, percent) => Math.round((amount * Number(percent)) / 100);

export const toMajor = (minor) => Number((minor / 100).toFixed(2));

export const formatMoney = (minor, symbol = '₹') =>
  `${symbol}${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Round a total to the nearest whole major unit; returns [newTotal, adjustment]. */
export function roundTotal(total) {
  const rounded = Math.round(total / 100) * 100;
  return [rounded, rounded - total];
}
