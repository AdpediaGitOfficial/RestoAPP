import net from 'node:net';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { formatMoney } from '../lib/money.js';
import { emitStaff } from '../realtime/io.js';

const WIDTH = () => config.printer.charsPerLine;

const line = (ch = '-') => ch.repeat(WIDTH());
const center = (text) => {
  const w = WIDTH();
  const t = text.slice(0, w);
  return ' '.repeat(Math.max(0, Math.floor((w - t.length) / 2))) + t;
};
/** Left text + right text on one line, padded apart. */
const spread = (left, right) => {
  const w = WIDTH();
  const l = String(left);
  const r = String(right);
  const gap = Math.max(1, w - l.length - r.length);
  return l.slice(0, w - r.length - 1) + ' '.repeat(gap) + r;
};
/** Wrap long text, indenting continuation lines. */
const wrap = (text, indent = 0) => {
  const width = WIDTH() - indent;
  const words = String(text).split(/\s+/);
  const out = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > width) {
      if (cur) out.push(' '.repeat(indent) + cur.trim());
      cur = word;
    } else cur += ' ' + word;
  }
  if (cur.trim()) out.push(' '.repeat(indent) + cur.trim());
  return out;
};

const stamp = (d = new Date()) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Kitchen Order Ticket. Deliberately terse: the kitchen needs the table,
 * the items and the notes — not prices.
 */
export function renderKot({ order, items, table, session, settings, isVoid = false }) {
  const out = [];
  out.push(center(isVoid ? '*** CANCELLED ORDER ***' : '*** KITCHEN ORDER ***'));
  out.push(line('='));
  out.push(spread(`TABLE ${table.label}`, `#${order.order_number}`));
  out.push(spread(session?.code ? `Session ${session.code}` : '', stamp(order.created_at)));
  out.push(order.channel === 'QR' ? 'Placed by guest (QR)' : 'Placed by staff');
  out.push(line('='));
  for (const it of items) {
    out.push(...wrap(`${String(it.quantity).padStart(2, ' ')} x ${it.item_name}${it.variant_name ? ` (${it.variant_name})` : ''}`));
    for (const addon of it.addons || []) out.push(...wrap(`+ ${addon.name}`, 5));
    if (it.note) out.push(...wrap(`** ${it.note}`, 5));
  }
  out.push(line('='));
  if (order.note) {
    out.push('ORDER NOTE:');
    out.push(...wrap(order.note, 2));
    out.push(line('-'));
  }
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  out.push(spread(`Items: ${items.length}`, `Qty: ${totalQty}`));
  out.push(center(settings?.name || ''));
  out.push('');
  return out.join('\n');
}

/** Guest-facing bill / receipt. */
export function renderBill({ bill, items, table, session, settings, payment }) {
  const sym = settings?.currency_symbol || '₹';
  const out = [];
  out.push(center((settings?.name || 'RESTAURANT').toUpperCase()));
  if (settings?.address) out.push(...wrap(settings.address).map((l) => center(l.trim())));
  if (settings?.phone) out.push(center(`Ph: ${settings.phone}`));
  out.push(line('='));
  out.push(spread(`Bill: ${bill.bill_number}`, `Table: ${table.label}`));
  out.push(spread(stamp(bill.settled_at || bill.created_at), `Guests: ${session?.guest_count ?? '-'}`));
  out.push(line('-'));
  out.push(spread('Item', 'Amount'));
  out.push(line('-'));
  for (const it of items) {
    const unit = it.unit_price + (it.addons_total || 0);
    out.push(...wrap(`${it.item_name}${it.variant_name ? ` (${it.variant_name})` : ''}`));
    out.push(spread(`   ${it.quantity} x ${formatMoney(unit, sym)}`, formatMoney(it.line_total, sym)));
    for (const addon of it.addons || []) out.push(...wrap(`+ ${addon.name}`, 5));
  }
  out.push(line('-'));
  out.push(spread('Subtotal', formatMoney(bill.subtotal, sym)));
  if (bill.discount_amount > 0) {
    out.push(spread(`Discount${bill.discount_reason ? ` (${bill.discount_reason})` : ''}`, `-${formatMoney(bill.discount_amount, sym)}`));
  }
  if (bill.service_charge_amount > 0) {
    out.push(spread(`Service charge ${bill.service_charge_percent}%`, formatMoney(bill.service_charge_amount, sym)));
  }
  if (bill.tax_amount > 0) {
    out.push(spread(`${settings?.tax_label || 'Tax'} ${bill.tax_percent}%`, formatMoney(bill.tax_amount, sym)));
  }
  if (bill.rounding_adjustment !== 0) {
    out.push(spread('Rounding', formatMoney(bill.rounding_adjustment, sym)));
  }
  out.push(line('='));
  out.push(spread('TOTAL', formatMoney(bill.total, sym)));
  out.push(line('='));
  if (payment?.method) out.push(spread('Paid by', payment.method));
  if (payment?.reference) out.push(spread('Ref', payment.reference));
  out.push('');
  out.push(...wrap(settings?.bill_footer_note || 'Thank you!').map((l) => center(l.trim())));
  out.push('');
  return out.join('\n');
}

// --------------------------------------------------------------- ESC/POS
const ESC = 0x1b;
const GS = 0x1d;

/** Minimal ESC/POS encoder — enough for a plain-text ticket on a 58/80mm printer. */
export function toEscPos(text, { cut = true } = {}) {
  const chunks = [
    Buffer.from([ESC, 0x40]),          // initialise
    Buffer.from([ESC, 0x61, 0x00]),    // align left
    Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8'),
    Buffer.from('\r\n\r\n\r\n'),
  ];
  if (cut) chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // partial cut
  return Buffer.concat(chunks);
}

function sendToPrinter(buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.printer.host, port: config.printer.port });
    const fail = (err) => { socket.destroy(); reject(err); };
    socket.setTimeout(5000, () => fail(new Error('Printer connection timed out')));
    socket.on('error', fail);
    socket.on('connect', () => socket.write(buffer, () => socket.end()));
    socket.on('close', resolve);
  });
}

/**
 * Queue a ticket. It is always persisted (so the browser-based
 * /print pages and reprints work) and, when a network printer is
 * configured, streamed straight to it.
 */
export async function queuePrintJob({ type, station = 'KITCHEN', orderId = null, billId = null, content, copyNumber = 1 }) {
  const { rows } = await query(
    `INSERT INTO print_jobs (type, station, order_id, bill_id, content, copy_number)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [type, station, orderId, billId, content, copyNumber],
  );
  const job = rows[0];

  if (config.printer.driver === 'escpos' && config.printer.host) {
    try {
      await sendToPrinter(toEscPos(content, { cut: config.printer.cutPaper }));
      await markPrinted(job.id);
      job.status = 'PRINTED';
    } catch (err) {
      await query('UPDATE print_jobs SET status = $2, error = $3 WHERE id = $1', [job.id, 'FAILED', err.message]);
      job.status = 'FAILED';
      job.error = err.message;
      console.error('[print] failed:', err.message);
    }
  }

  // Kitchen screens listen for this and can auto-open the printable ticket.
  emitStaff('print:job', { id: job.id, type: job.type, station: job.station, orderId, billId, status: job.status });
  return job;
}

export async function markPrinted(id) {
  const { rows } = await query(
    `UPDATE print_jobs SET status = 'PRINTED', printed_at = now(), error = NULL WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] || null;
}
