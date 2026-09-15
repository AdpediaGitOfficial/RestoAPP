'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

type Handlers = Record<string, (payload: any) => void>;

/**
 * Subscribe to realtime events. Staff screens pass nothing (their JWT is
 * picked up automatically); guest screens pass their session id.
 */
export function useRealtime(handlers: Handlers, opts: { sessionId?: string | null; tableId?: string | null; staff?: boolean } = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const { sessionId, tableId, staff } = opts;

  useEffect(() => {
    const socket: Socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        token: staff ? getToken() : undefined,
        sessionId: sessionId || undefined,
        tableId: tableId || undefined,
      },
    });

    const events = Object.keys(handlersRef.current);
    const bound = events.map((event) => {
      const fn = (payload: unknown) => handlersRef.current[event]?.(payload);
      socket.on(event, fn);
      return [event, fn] as const;
    });

    return () => {
      bound.forEach(([event, fn]) => socket.off(event, fn));
      socket.disconnect();
    };
    // Re-connect when the identity of the screen changes, not on every render.
  }, [sessionId, tableId, staff]);
}
