import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { shell } from 'electron';
import type { GoogleTokens } from '../shared/ipc';

/**
 * Login Google para apps instalados (RFC 8252): abre o navegador do sistema,
 * recebe o código em um servidor loopback efêmero (127.0.0.1, porta aleatória)
 * e troca o código usando PKCE. O NOX nunca vê a senha do Google.
 *
 * Requer um cliente OAuth do tipo "App para computador" no Google Cloud do
 * mesmo projeto do Firebase. Para esse tipo de cliente o Google documenta que o
 * "client secret" não é confidencial; a segurança vem do PKCE + loopback.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 5 * 60_000;

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const page = (title: string, body: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>NOX</title>
<style>html,body{margin:0;height:100%;background:#050608;color:#F0F3F1;font:15px/1.5 system-ui,sans-serif}
main{height:100%;display:grid;place-content:center;text-align:center;gap:8px}
code{font:12px/1 Consolas,monospace;color:#B7FF5A;letter-spacing:.12em;text-transform:uppercase}
p{color:#929B98;margin:0}</style></head><body><main><code>NOX // AUTH</code><h1 style="margin:8px 0 0;font-size:22px">${title}</h1><p>${body}</p></main></body></html>`;

let active: { server: Server; reject: (err: Error) => void } | null = null;

export function cancelGoogleSignIn() {
  if (!active) return;
  active.reject(new Error('Login cancelado.'));
}

export async function googleSignIn(clientId: string, clientSecret: string | undefined): Promise<GoogleTokens> {
  if (!clientId) throw new Error('Login Google não configurado (MAIN_VITE_GOOGLE_DESKTOP_CLIENT_ID).');
  cancelGoogleSignIn();

  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(24));

  const server = createServer();
  await new Promise<void>((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => res());
  });
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('O login expirou. Tente novamente.')), TIMEOUT_MS);
    const finish = (err: Error | null, value?: string) => {
      clearTimeout(timer);
      active = null;
      server.close();
      if (err) reject(err);
      else resolve(value!);
    };
    active = { server, reject: (err) => finish(err) };

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const returnedState = url.searchParams.get('state');
      const returnedCode = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (error || returnedState !== state || !returnedCode) {
        res.end(page('Login não concluído', 'Você pode fechar esta aba e tentar de novo no NOX.'));
        finish(new Error(error === 'access_denied' ? 'Login cancelado.' : 'Resposta de login inválida.'));
        return;
      }
      res.end(page('Conexão estabelecida.', 'Pode fechar esta aba e voltar ao NOX.'));
      finish(null, returnedCode);
    });

    const auth = new URL(AUTH_URL);
    auth.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      prompt: 'select_account',
    }).toString();
    shell.openExternal(auth.toString()).catch((err: Error) => finish(err));
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json()) as { id_token?: string; access_token?: string; error_description?: string };
  if (!res.ok || !json.id_token) throw new Error(json.error_description ?? 'Falha ao concluir o login Google.');
  return { idToken: json.id_token, accessToken: json.access_token ?? null };
}
