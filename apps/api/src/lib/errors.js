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
  // 22P02 is Postgres refusing to read a value as the column's type — in
  // practice a malformed id in the URL, from a stale link or a scanner.
  // That is a request for something that cannot exist, not a fault on our
  // side, and it should not read as one in the logs or to the caller.
  if (err?.code === '22P02') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That record does not exist' } });
  }
  if (err?.code === '23503') {
    return res.status(409).json({ error: { code: 'IN_USE', message: 'That record is referenced by other data and cannot be removed' } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: { code: 'FILE_TOO_LARGE', message: 'That photo is too large. Please use one under 8MB.' },
    });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: { code: 'BAD_UPLOAD', message: 'Upload one photo at a time.' } });
  }

  // Errors that carry their own status (e.g. the CORS gate) are operator
  // problems, not bugs — surface the message rather than swallowing it.
  if (err?.status && err?.code) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
}
