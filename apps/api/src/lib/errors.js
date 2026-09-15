export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have access to this action') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg, details) => new AppError(409, 'CONFLICT', msg, details);

/** Wrap an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  // Postgres unique violation -> a friendlier message.
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'That record already exists', details: err.detail } });
  }
  if (err?.code === '23503') {
    return res.status(409).json({ error: { code: 'IN_USE', message: 'That record is referenced by other data and cannot be removed' } });
  }
  // Errors that carry their own status (e.g. the CORS gate) are operator
  // problems, not bugs — surface the message rather than swallowing it.
  if (err?.status && err?.code) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
}
