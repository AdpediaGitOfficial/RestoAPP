import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { searchQuery, pickPhoto, creditFor } from '../src/services/photo-search.js';

const photo = (over = {}) => ({
  id: 1, width: 1880, height: 1253, photographer: 'A', url: 'https://pexels.com/photo/1',
  src: { large2x: 'https://x/1' }, ...over,
});

describe('building the search', () => {
  test('uses a curated query where the dish name alone would mislead', () => {
    // "Cold Brew" on its own returns cold weather; "Club Sandwich" returns nightclubs.
    assert.match(searchQuery({ name: 'Cold Brew' }), /iced coffee/);
    assert.match(searchQuery({ name: 'Club Sandwich' }), /triple decker/);
    assert.equal(searchQuery({ name: 'CAPPUCCINO' }), 'cappuccino latte art cup');
  });

  test('falls back to the dish name plus a hint from its category', () => {
    assert.equal(searchQuery({ name: 'Dosa', category_name: 'Breakfast' }), 'Dosa food');
    assert.equal(searchQuery({ name: 'Nimbu Pani', category_name: 'Cold Brews' }), 'Nimbu Pani drink');
    assert.equal(searchQuery({ name: 'Rum Baba', category_name: 'Bakery' }), 'Rum Baba bakery');
  });

  test('drops words that describe the business rather than the food', () => {
    assert.equal(searchQuery({ name: 'House Special Thali', category_name: 'Mains' }), 'Thali food');
  });

  test('never returns an empty query for a named item', () => {
    // Every word is noise — the name must still survive.
    assert.ok(searchQuery({ name: 'Special', category_name: 'Mains' }).trim().length > 0);
    assert.equal(searchQuery({ name: '' }), '');
    assert.equal(searchQuery({}), '');
  });
});

describe('choosing a photo', () => {
  test('takes the first usable result', () => {
    assert.equal(pickPhoto([photo({ id: 7 })])?.id, 7);
  });

  test('rejects portraits and near-square crops that a landscape card would ruin', () => {
    assert.equal(pickPhoto([photo({ width: 800, height: 1400 })]), null);
    assert.equal(pickPhoto([photo({ width: 1000, height: 990 })]), null);
  });

  test('rejects panoramas, where the dish becomes a speck', () => {
    assert.equal(pickPhoto([photo({ width: 3000, height: 1000 })]), null);
  });

  test('rejects anything too small to fill the 1000px rendition', () => {
    assert.equal(pickPhoto([photo({ width: 600, height: 400 })]), null);
  });

  test('skips photos already used, so two dishes never share one', () => {
    const used = new Set(['1']);
    assert.equal(pickPhoto([photo({ id: 1 })], { used }), null);
    assert.equal(pickPhoto([photo({ id: 1 }), photo({ id: 2 })], { used })?.id, 2);
  });

  test('needs a usable source url', () => {
    assert.equal(pickPhoto([photo({ src: {} })]), null);
  });

  test('copes with an empty or malformed response', () => {
    assert.equal(pickPhoto([]), null);
    assert.equal(pickPhoto(null), null);
    assert.equal(pickPhoto([null, undefined]), null);
  });
});

describe('recording provenance', () => {
  test('captures who took it, where it came from and under what licence', () => {
    const c = creditFor(photo({ photographer: 'Jane Doe', url: 'https://pexels.com/photo/9' }));
    assert.equal(c.source, 'pexels');
    assert.equal(c.photographer, 'Jane Doe');
    assert.equal(c.source_url, 'https://pexels.com/photo/9');
    assert.match(c.license, /commercial use/i);
    assert.ok(!Number.isNaN(Date.parse(c.imported_at)));
  });

  test('tolerates a result missing the optional fields', () => {
    const c = creditFor({ id: 1 });
    assert.equal(c.photographer, null);
    assert.match(c.license, /Pexels/);
  });
});
