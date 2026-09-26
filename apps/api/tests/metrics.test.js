import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hourLabel } from '../src/lib/reporting.js';

/**
 * These cover the parts of reporting that are pure arithmetic and can be
 * checked without a database. The SQL itself is exercised against a live
 * database by scripts/verify-metrics.mjs, which seeds orders at known
 * wall-clock times and asserts the hour buckets land where they were put —
 * the one thing unit tests cannot prove about a timezone.
 */

import { pctChange, trendOf, tradingHours, looksLikeUuid } from '../src/lib/reporting.js';

describe('pctChange', () => {
  test('reports a plain percentage move', () => {
    assert.equal(pctChange(110, 100), 10);
    assert.equal(pctChange(90, 100), -10);
  });

  test('rounds to one decimal, the most a dashboard can honour', () => {
    assert.equal(pctChange(1234, 1000), 23.4);
    assert.equal(pctChange(100.04, 100), 0);
  });

  test('a quiet previous period gives null, never an infinite jump', () => {
    assert.equal(pctChange(500, 0), null);
  });

  test('nothing either side is no change, not "new"', () => {
    assert.equal(pctChange(0, 0), 0);
  });

  test('a drop to zero is -100%, not null', () => {
    assert.equal(pctChange(0, 400), -100);
  });
});

describe('trendOf', () => {
  test('small wobble is flat — noise is not a trend', () => {
    assert.equal(trendOf(102, 100), 'flat');
    assert.equal(trendOf(97, 100), 'flat');
  });

  test('a real move gets an arrow', () => {
    assert.equal(trendOf(130, 100), 'up');
    assert.equal(trendOf(70, 100), 'down');
  });

  test('an item with no history is new, not up', () => {
    assert.equal(trendOf(40, 0), 'new');
  });

  test('an item that stopped selling is down', () => {
    assert.equal(trendOf(0, 40), 'down');
  });
});

describe('tradingHours', () => {
  const q = (pairs) => Array.from({ length: 24 }, (_, hour) => ({ hour, quantity: pairs[hour] ?? 0 }));

  test('trims the closed hours at both ends', () => {
    const hours = tradingHours(q({ 11: 2, 12: 9, 20: 4 }), (d) => d.quantity);
    assert.deepEqual(hours.map((h) => h.hour), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  test('keeps a quiet hour in the middle — zero sold is not closed', () => {
    const hours = tradingHours(q({ 12: 5, 16: 3 }), (d) => d.quantity);
    assert.equal(hours.length, 5);
    assert.equal(hours[2].quantity, 0);          // 14:00 stays in the axis
  });

  test('a single busy hour yields exactly that hour', () => {
    assert.deepEqual(tradingHours(q({ 13: 7 }), (d) => d.quantity).map((h) => h.hour), [13]);
  });

  test('a day with no trade yields nothing to draw', () => {
    assert.deepEqual(tradingHours(q({}), (d) => d.quantity), []);
  });

  test('a restaurant open past midnight keeps both ends', () => {
    const hours = tradingHours(q({ 0: 3, 1: 1, 23: 6 }), (d) => d.quantity);
    assert.equal(hours[0].hour, 0);
    assert.equal(hours[hours.length - 1].hour, 23);
  });
});

describe('hourLabel', () => {
  test('reads as a clock, not a number', () => {
    assert.equal(hourLabel(0), '12 AM');
    assert.equal(hourLabel(9), '9 AM');
    assert.equal(hourLabel(12), '12 PM');
    assert.equal(hourLabel(13), '1 PM');
    assert.equal(hourLabel(23), '11 PM');
  });

  test('has a short form for a crowded axis', () => {
    assert.equal(hourLabel(13, true), '1p');
    assert.equal(hourLabel(9, true), '9a');
  });
});

describe('looksLikeUuid', () => {
  test('accepts a real menu item id', () => {
    assert.equal(looksLikeUuid('24d9188f-b29c-45ba-8398-44d39933b436'), true);
    assert.equal(looksLikeUuid('24D9188F-B29C-45BA-8398-44D39933B436'), true);
  });

  test('rejects a 36-character name that is only hex-shaped', () => {
    // The bug: this is 36 chars of hex, reached the ::uuid cast, and 500'd.
    assert.equal(looksLikeUuid('a'.repeat(36)), false);
    assert.equal(looksLikeUuid('-'.repeat(36)), false);
  });

  test('rejects dish names, including ones with dashes and digits', () => {
    for (const name of ['Cold Brew', 'Chicken 65', 'Slow-Roast Lamb', '', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaag']) {
      assert.equal(looksLikeUuid(name), false, name);
    }
  });

  test('rejects a uuid with the groups mis-sized', () => {
    assert.equal(looksLikeUuid('24d9188f-b29c-45ba-8398-44d39933b43'), false);   // 11 in the tail
    assert.equal(looksLikeUuid('24d9188fb29c45ba839844d39933b436'), false);      // no dashes
  });

  test('rejects anything that is not a string', () => {
    for (const v of [null, undefined, 42, {}, []]) assert.equal(looksLikeUuid(v), false);
  });
});
