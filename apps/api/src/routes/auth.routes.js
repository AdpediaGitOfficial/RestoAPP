import { Router } from 'express';
import { query } from '../db/index.js';
import {
  clearAuthCookie, hashPassword, requireAuth, requireRole,
  setAuthCookie, signToken, verifyPassword,
} from '../lib/auth.js';
import { asyncHandler, notFound, unauthorized } from '../lib/errors.js';
import { validate, z } from '../lib/validate.js';

export const authRoutes = Router();

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active });

authRoutes.post('/login',
  validate(z.object({ email: z.string().email(), password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    const user = rows[0];
    if (!user || !user.is_active) throw unauthorized('Incorrect email or password');
    if (!(await verifyPassword(password, user.password_hash))) throw unauthorized('Incorrect email or password');

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ token, user: publicUser(user) });
  }));

authRoutes.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRoutes.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw notFound('User not found');
  res.json({ user: publicUser(rows[0]) });
}));

authRoutes.post('/change-password', requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(req.body.currentPassword, rows[0].password_hash))) {
      throw unauthorized('Your current password is incorrect');
    }
    await query('UPDATE users SET password_hash = $2 WHERE id = $1',
      [req.user.id, await hashPassword(req.body.newPassword)]);
    res.json({ ok: true });
  }));

// ----------------------------------------------------------- staff admin
authRoutes.get('/users', requireAuth, requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT * FROM users ORDER BY name');
  res.json({ users: rows.map(publicUser) });
}));

authRoutes.post('/users', requireAuth, requireRole('ADMIN'),
  validate(z.object({
    name: z.string().trim().min(2),
    email: z.string().email(),
    password: z.string().min(8, 'Use at least 8 characters'),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'KITCHEN']),
  })),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email, await hashPassword(password), role],
    );
    res.status(201).json({ user: publicUser(rows[0]) });
  }));

authRoutes.patch('/users/:id', requireAuth, requireRole('ADMIN'),
  validate(z.object({
    name: z.string().trim().min(2).optional(),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'KITCHEN']).optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(8).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { name, role, is_active, password } = req.body;
    const { rows } = await query(
      `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3::user_role, role),
              is_active = COALESCE($4, is_active),
              password_hash = COALESCE($5, password_hash)
        WHERE id = $1 RETURNING *`,
      [req.params.id, name ?? null, role ?? null, is_active ?? null,
        password ? await hashPassword(password) : null],
    );
    if (!rows[0]) throw notFound('User not found');
    res.json({ user: publicUser(rows[0]) });
  }));
