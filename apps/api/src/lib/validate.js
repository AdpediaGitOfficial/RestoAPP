import { z } from 'zod';

/** Validate req.body / req.query / req.params against a zod schema. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req[source === 'query' ? 'validatedQuery' : source] = result.data;
  return next();
};

export const uuid = z.string().uuid('Must be a valid id');
export const money = z.number().int('Amount must be a whole number of minor units').min(0);
export const shortText = z.string().trim().min(1).max(200);
export { z };
