import { z } from '@hono/zod-openapi'

export const numericParam = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int().optional(),
)

export const numericParamRequired = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.number().int({ message: 'Must be an integer' }),
)
