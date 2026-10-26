import type { MiddlewareHandler } from 'hono';
import type { AppEnv, Deps } from './context';
import { unauthorized } from './errors';

/** Valida o ID token do Firebase enviado como `Authorization: Bearer <token>`. */
export function requireAuth(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1]) throw unauthorized();
    try {
      const decoded = await deps.auth.verifyIdToken(match[1]);
      c.set('uid', decoded.uid);
    } catch {
      throw unauthorized();
    }
    await next();
  };
}
