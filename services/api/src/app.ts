import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv, Deps } from './context';
import { ApiError } from './errors';
import { requireAuth } from './auth';
import { socialRoutes } from './routes/social';
import { communityRoutes } from './routes/communities';
import { livekitWebhookRoutes, voiceRoutes } from './routes/voice';
import { accountRoutes } from './routes/account';

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();

  app.use('*', secureHeaders());
  // A API usa apenas tokens Bearer (sem cookies), então CORS aberto não expõe sessões.
  app.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
  app.use('*', bodyLimit({ maxSize: 64 * 1024 }));

  app.get('/healthz', (c) => c.json({ ok: true, service: 'nox-api', voice: deps.config.livekit !== null }));

  // Webhook antes do middleware de autenticação.
  app.route('/v1', livekitWebhookRoutes(deps));

  const v1 = new Hono<AppEnv>();
  v1.use('*', requireAuth(deps));
  v1.route('/', socialRoutes(deps));
  v1.route('/', communityRoutes(deps));
  v1.route('/', voiceRoutes(deps));
  v1.route('/', accountRoutes(deps));
  app.route('/v1', v1);

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Rota inexistente.' } }, 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    if (err instanceof SyntaxError) {
      return c.json({ error: { code: 'invalid_json', message: 'Corpo da requisição inválido.' } }, 400);
    }
    console.error(JSON.stringify({ severity: 'ERROR', message: err.message, stack: err.stack, path: c.req.path }));
    return c.json({ error: { code: 'internal', message: 'Erro interno.' } }, 500);
  });

  return app;
}
