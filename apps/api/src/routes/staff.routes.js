/** Kitchen + supervisor endpoints. Everything here needs a signed-in user. */
import { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { validate, z } from '../lib/validate.js';
import { createOrder, getOrder, listOrders, updateOrderItemStatus, updateOrderStatus } from '../services/orders.js';
import {
  closeSession, getSessionDetail, listNotifications, listTableBoard,
  markNotificationRead, updateSession,
} from '../services/sessions.js';
import { generateBill, getBill, listBills, settleBill, voidBill } from '../services/billing.js';
import { markPrinted, queuePrintJob, renderBill, renderKot } from '../services/printing.js';
import { getSettings } from '../services/settings.js';

export const staffRoutes = Router();
staffRoutes.use(requireAuth);

// ------------------------------------------------------------- floor view
staffRoutes.get('/tables', asyncHandler(async (_req, res) => {
  res.json({ tables: await listTableBoard() });
}));

staffRoutes.get('/sessions/:id', asyncHandler(async (req, res) => {
  res.json(await getSessionDetail(req.params.id));
}));

staffRoutes.patch('/sessions/:id', requireRole('SUPERVISOR'),
  validate(z.object({
    guestCount: z.number().int().min(1).max(50).optional(),
    guestName: z.string().max(80).optional(),
    guestPhone: z.string().max(20).optional(),
  })),
  asyncHandler(async (req, res) => {
    res.json({ session: await updateSession(req.params.id, req.body) });
  }));

staffRoutes.post('/sessions/:id/close', requireRole('SUPERVISOR'), asyncHandler(async (req, res) => {
  res.json({ session: await closeSession(req.params.id, req.user.id) });
}));

// ---------------------------------------------------------------- orders
staffRoutes.get('/orders', asyncHandler(async (req, res) => {
  const { status, sessionId, tableId, active, limit } = req.query;
  res.json({
    orders: await listOrders({
      status, sessionId, tableId, limit,
      active: active === 'true' || active === '1',
    }),
  });
}));

staffRoutes.get('/orders/:id', asyncHandler(async (req, res) => {
  res.json({ order: await getOrder(req.params.id) });
}));

/** Supervisor takes an order at the table on the guest's behalf. */
staffRoutes.post('/orders', requireRole('SUPERVISOR'),
  validate(z.object({
    tableId: z.string().uuid(),
    guestCount: z.number().int().min(1).max(50).optional(),
    note: z.string().max(500).optional(),
    items: z.array(z.object({
      menuItemId: z.string().uuid(),
      variantId: z.string().uuid().nullable().optional(),
      addonIds: z.array(z.string().uuid()).max(20).optional(),
      quantity: z.number().int().min(1).max(50),
      note: z.string().max(200).optional(),
    })).min(1),
  })),
  asyncHandler(async (req, res) => {
    const order = await createOrder({
      tableId: req.body.tableId,
      items: req.body.items,
      note: req.body.note || '',
      channel: 'STAFF',
      placedBy: req.user.id,
      guestCount: req.body.guestCount,
    });
    res.status(201).json({ order });
  }));

staffRoutes.post('/orders/:id/status',
  validate(z.object({
    status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
    reason: z.string().max(200).optional(),
  })),
  asyncHandler(async (req, res) => {
    const order = await updateOrderStatus(req.params.id, req.body.status, {
      userId: req.user.id, reason: req.body.reason,
    });
    res.json({ order });
  }));

staffRoutes.post('/order-items/:id/status',
  validate(z.object({ status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']) })),
  asyncHandler(async (req, res) => {
    res.json({ order: await updateOrderItemStatus(req.params.id, req.body.status) });
  }));

/** Re-send a kitchen ticket (paper jam, lost slip). */
staffRoutes.post('/orders/:id/reprint', asyncHandler(async (req, res) => {
  const order = await getOrder(req.params.id);
  const settings = await getSettings();
  const { rows } = await query(
    'SELECT COALESCE(MAX(copy_number), 0)::int AS n FROM print_jobs WHERE order_id = $1',
    [order.id],
  );
  const job = await queuePrintJob({
    type: 'KOT',
    station: order.items?.[0]?.kitchen_station || 'KITCHEN',
    orderId: order.id,
    copyNumber: rows[0].n + 1,
    content: renderKot({
      order, items: order.items, table: { label: order.table_label },
      session: { code: order.session_code }, settings,
    }),
  });
  res.status(201).json({ job });
}));

// ---------------------------------------------------------------- billing
staffRoutes.post('/sessions/:id/bill', requireRole('SUPERVISOR'),
  validate(z.object({
    discountAmount: z.number().int().min(0).optional(),
    discountReason: z.string().max(120).optional(),
  })),
  asyncHandler(async (req, res) => {
    const bill = await generateBill(req.params.id, {
      userId: req.user.id,
      discountAmount: req.body.discountAmount || 0,
      discountReason: req.body.discountReason || '',
    });
    res.status(201).json({ bill });
  }));

staffRoutes.get('/bills', asyncHandler(async (req, res) => {
  res.json({ bills: await listBills(req.query) });
}));

staffRoutes.get('/bills/:id', asyncHandler(async (req, res) => {
  res.json(await getBill(req.params.id));
}));

staffRoutes.post('/bills/:id/settle', requireRole('SUPERVISOR'),
  validate(z.object({
    paymentMethod: z.enum(['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER']),
    paymentReference: z.string().max(120).optional(),
    amountPaid: z.number().int().min(0).optional(),
  })),
  asyncHandler(async (req, res) => {
    const bill = await settleBill(req.params.id, {
      userId: req.user.id,
      paymentMethod: req.body.paymentMethod,
      paymentReference: req.body.paymentReference || null,
      amountPaid: req.body.amountPaid,
    });
    res.json({ bill });
  }));

staffRoutes.post('/bills/:id/void', requireRole('SUPERVISOR'),
  validate(z.object({ reason: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    res.json({ bill: await voidBill(req.params.id, { userId: req.user.id, reason: req.body.reason }) });
  }));

staffRoutes.post('/bills/:id/reprint', requireRole('SUPERVISOR'), asyncHandler(async (req, res) => {
  const { bill, items, settings } = await getBill(req.params.id);
  const job = await queuePrintJob({
    type: 'BILL', station: 'COUNTER', billId: bill.id, copyNumber: 2,
    content: renderBill({
      bill, items, table: { label: bill.table_label },
      session: { code: bill.session_code, guest_count: bill.guest_count }, settings,
      payment: { method: bill.payment_method, reference: bill.payment_reference },
    }),
  });
  res.status(201).json({ job });
}));

// ----------------------------------------------------------- print queue
staffRoutes.get('/print-jobs', asyncHandler(async (req, res) => {
  const status = req.query.status || 'QUEUED';
  const { rows } = await query(
    `SELECT p.*, o.order_number, t.label AS table_label
       FROM print_jobs p
       LEFT JOIN orders o ON o.id = p.order_id
       LEFT JOIN dining_tables t ON t.id = o.table_id
      WHERE p.status = $1::print_job_status
      ORDER BY p.created_at ASC LIMIT 50`, [status],
  );
  res.json({ jobs: rows });
}));

staffRoutes.get('/print-jobs/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM print_jobs WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Print job not found');
  res.json({ job: rows[0] });
}));

staffRoutes.post('/print-jobs/:id/printed', asyncHandler(async (req, res) => {
  const job = await markPrinted(req.params.id);
  if (!job) throw notFound('Print job not found');
  res.json({ job });
}));

// -------------------------------------------------------- notifications
staffRoutes.get('/notifications', asyncHandler(async (req, res) => {
  res.json({
    notifications: await listNotifications({
      unreadOnly: req.query.all !== 'true',
      limit: req.query.limit,
    }),
  });
}));

staffRoutes.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  res.json({ notification: await markNotificationRead(req.params.id, req.user.id) });
}));
