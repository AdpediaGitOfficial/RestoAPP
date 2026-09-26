/**
 * Pure helpers behind the analytics endpoints.
 *
 * These live here rather than inside the SQL, or inside the browser, because
 * they encode judgements the whole product has to agree on: what counts as a
 * real move, which hours a restaurant actually trades in, and how an hour is
 * named. A chart and a printed report that disagree on any of those are worse
 * than either alone.
 */

/**
 * Percentage change against the previous equivalent window, to one decimal.
 *
 * Returns null when there is nothing to compare against — the caller renders
 * that as "new". Reporting +∞%, or quietly substituting 100%, invents a
 * number the data does not contain.
 */
export function pctChange(now, before) {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/**
 * Which way an item is moving. The 5% dead-band matters: without it a dish
 * that sold 20 yesterday and 21 today gets an up-arrow, every item sprouts
 * arrows every day, and the owner learns to ignore them.
 */
export function trendOf(now, before) {
  if (before === 0) return now === 0 ? 'flat' : 'new';
  if (now > before * 1.05) return 'up';
  if (now < before * 0.95) return 'down';
  return 'flat';
}

/**
 * Trim a 24-hour series to the hours the restaurant actually traded in.
 *
 * A café that opens at 8 and closes at 23 should not spend a third of the
 * chart on empty night. Quiet hours *between* the first and last sale are
 * kept: "sold none at 3pm" is a real and useful fact, and dropping it would
 * silently close the gap and misstate the shape of the day.
 */
export function tradingHours(rows, valueOf) {
  const busy = rows.filter((r) => valueOf(r) > 0);
  if (!busy.length) return [];
  const first = Math.min(...busy.map((r) => r.hour));
  const last = Math.max(...busy.map((r) => r.hour));
  return rows.filter((r) => r.hour >= first && r.hour <= last);
}

/** 13 -> "1 PM", or "1p" where an axis is tight. */
export function hourLabel(hour, short = false) {
  const suffix = hour < 12 ? (short ? 'a' : 'AM') : short ? 'p' : 'PM';
  return `${hour % 12 || 12}${short ? '' : ' '}${suffix}`;
}
