import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../lib/auth.js';

let io = null;

/**
 * Rooms
 *   staff            – every signed-in staff member (supervisors + admins)
 *   kitchen          – kitchen display screens
 *   session:<id>     – the guests sitting at one table session
 *   table:<id>       – anyone watching a specific table
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    const { token, sessionId, tableId } = socket.handshake.auth || {};

    // Staff sockets authenticate with their JWT; guests join by session id only.
    const payload = token ? verifyToken(token) : null;
    if (payload) {
      socket.data.user = { id: payload.sub, role: payload.role };
      socket.join('staff');
      if (['KITCHEN', 'ADMIN', 'SUPERVISOR'].includes(payload.role)) socket.join('kitchen');
    }
    if (sessionId) socket.join(`session:${sessionId}`);
    if (tableId) socket.join(`table:${tableId}`);

    socket.on('session:join', (id) => id && socket.join(`session:${id}`));
    socket.on('session:leave', (id) => id && socket.leave(`session:${id}`));
  });

  return io;
}

export function emitTo(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

/** Broadcast to everyone on the staff side (supervisors, admins, kitchen). */
export function emitStaff(event, payload) {
  emitTo('staff', event, payload);
  emitTo('kitchen', event, payload);
}

export const getIo = () => io;
