import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../src/services/billing.js';
import { percentOf, roundTotal, formatMoney } from '../src/lib/money.js';
import { renderKot, renderBill, toEscPos } from '../src/services/printing.js';

const settings = {
  name: 'Test Cafe', currency_symbol: '₹', tax_label: 'GST',
  tax_percent: 5, service_charge_percent: 0,
  tax_inclusive: false, round_bill_total: false,
  bill_footer_note: 'Thanks',
};

describe('money helpers', () => {
  test('percentOf rounds to whole minor units', () => {
    assert.equal(percentOf(10000, 5), 500);
    assert.equal(percentOf(333, 7.5), 25);   // 24.975 -> 25
  });

  test('roundTotal snaps to the nearest major unit', () => {
    assert.deepEqual(roundTotal(57750), [57800, 50]);
    assert.deepEqual(roundTotal(57720), [57700, -20]);
    assert.deepEqual(roundTotal(57700), [57700, 0]);
  });

  test('formatMoney renders two decimals', () => {
    assert.equal(formatMoney(57800), '₹578.00');
    assert.equal(formatMoney(0, '$'), '$0.00');
  });
});

describe('computeTotals', () => {
  test('adds exclusive tax on top of the subtotal', () => {
    const t = computeTotals(100000, settings);
    assert.equal(t.tax_amount, 5000);
    assert.equal(t.total, 105000);
  });

  test('applies service charge before tax', () => {
    const t = computeTotals(100000, { ...settings, service_charge_percent: 10 });
    assert.equal(t.service_charge_amount, 10000);
    assert.equal(t.tax_amount, 5500);          // 5% of 110000
    assert.equal(t.total, 115500);
  });

  test('extracts tax when prices already include it', () => {
    const t = computeTotals(105000, { ...settings, tax_inclusive: true });
    assert.equal(t.total, 105000);             // guest pays the menu price
    assert.equal(t.tax_amount, 5000);          // 105000 - 105000/1.05
  });

  test('discount reduces the taxable amount', () => {
    const t = computeTotals(100000, settings, { discountAmount: 20000 });
    assert.equal(t.discount_amount, 20000);
    assert.equal(t.tax_amount, 4000);          // 5% of 80000
    assert.equal(t.total, 84000);
  });

  test('a discount can never exceed the subtotal or go negative', () => {
    assert.equal(computeTotals(5000, settings, { discountAmount: 999999 }).discount_amount, 5000);
    assert.equal(computeTotals(5000, settings, { discountAmount: -100 }).discount_amount, 0);
    assert.ok(computeTotals(5000, settings, { discountAmount: 999999 }).total >= 0);
  });

  test('rounding produces a whole major-unit total', () => {
    const t = computeTotals(57857, { ...settings, round_bill_total: true });
    assert.equal(t.total % 100, 0);
    assert.equal(t.total, t.subtotal + t.tax_amount + t.rounding_adjustment);
  });

  test('a zero-value session totals to zero', () => {
    const t = computeTotals(0, settings);
    assert.equal(t.total, 0);
    assert.equal(t.tax_amount, 0);
  });
});

describe('ticket rendering', () => {
  const order = { order_number: 1001, channel: 'QR', created_at: new Date(), note: 'No sugar' };
  const items = [{
    item_name: 'Cappuccino', variant_name: 'Large', quantity: 2, unit_price: 23000,
    addons: [{ name: 'Extra shot' }], addons_total: 5000, line_total: 56000, note: 'Extra hot',
  }];
  const table = { label: 'Table 1' };
  const session = { code: 'AB12CD', guest_count: 2 };

  test('the KOT carries the table, items, options and notes', () => {
    const kot = renderKot({ order, items, table, session, settings });
    assert.match(kot, /KITCHEN ORDER/);
    assert.match(kot, /Table 1/);
    assert.match(kot, /2 x Cappuccino \(Large\)/);
    assert.match(kot, /\+ Extra shot/);
    assert.match(kot, /Extra hot/);
    assert.match(kot, /No sugar/);
    // The kitchen must never see prices.
    assert.doesNotMatch(kot, /230\.00/);
  });

  test('a cancellation ticket is clearly marked', () => {
    assert.match(renderKot({ order, items, table, session, settings, isVoid: true }), /CANCELLED ORDER/);
  });

  test('no ticket line overflows the paper width', () => {
    const kot = renderKot({ order, items, table, session, settings });
    for (const line of kot.split('\n')) assert.ok(line.length <= 42, `too long: ${line}`);
  });

  test('the bill shows every charge line and the total', () => {
    const bill = {
      bill_number: 'B20260101-0001', subtotal: 56000, discount_amount: 1000,
      discount_reason: 'Loyalty', service_charge_amount: 5600, service_charge_percent: 10,
      tax_amount: 3030, tax_percent: 5, rounding_adjustment: -30, total: 63600,
      created_at: new Date(),
    };
    const text = renderBill({ bill, items, table, session, settings, payment: { method: 'UPI' } });
    assert.match(text, /B20260101-0001/);
    assert.match(text, /Subtotal/);
    assert.match(text, /Discount \(Loyalty\)/);
    assert.match(text, /Service charge 10%/);
    assert.match(text, /GST 5%/);
    assert.match(text, /TOTAL/);
    assert.match(text, /₹636\.00/);
    assert.match(text, /UPI/);
  });
});

describe('ESC/POS encoding', () => {
  test('starts with an init sequence and ends with a cut', () => {
    const buf = toEscPos('hello');
    assert.equal(buf[0], 0x1b);
    assert.equal(buf[1], 0x40);
    assert.deepEqual([...buf.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]);
    assert.ok(buf.includes(Buffer.from('hello')));
  });

  test('cutting can be turned off for continuous rolls', () => {
    assert.deepEqual([...toEscPos('hi', { cut: false }).subarray(-4)], [...Buffer.from('\r\n\r\n')]);
  });
});
