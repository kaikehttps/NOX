import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from '@nox/validation';
import { firstIssue } from '@nox/validation';

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const unauthorized = (message = 'Sessão inválida.') => new ApiError(401, 'unauthorized', message);
export const forbidden = (code = 'forbidden', message = 'Você não tem permissão para isso.') => new ApiError(403, code, message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const tooMany = () => new ApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um instante.');
export const unavailable = (code: string, message: string) => new ApiError(503, code, message);

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest('invalid_input', firstIssue(result.error));
  return result.data;
}
