import { Platform } from 'react-native';
import type * as GoogleSigninModule from '@react-native-google-signin/google-signin';
import { authErrorMessage } from '@nox/firebase';
import { googleConfig } from './config';

type Mod = typeof GoogleSigninModule;

let mod: Mod | null | undefined;
let configured = false;

/** Carrega o módulo nativo sob demanda: sem ele (ex.: build sem o pod), o app continua abrindo. */
function load(): Mod | null {
  if (mod !== undefined) return mod;
  try {
    mod = require('@react-native-google-signin/google-signin') as Mod;
  } catch {
    mod = null;
  }
  return mod;
}

function ensureConfigured(g: Mod) {
  if (configured) return;
  g.GoogleSignin.configure({
    webClientId: googleConfig.webClientId,
    ...(googleConfig.iosClientId ? { iosClientId: googleConfig.iosClientId } : {}),
    scopes: ['email', 'profile'],
  });
  configured = true;
}

export const googleEnabled = () => Boolean(googleConfig.webClientId);

export class GoogleSignInCancelled extends Error {}

/**
 * Fluxo oficial do Google Sign-In nativo. Devolve apenas o ID token, que o Firebase
 * troca por uma sessão. O NOX nunca vê nem pede a senha do Google.
 */
export async function getGoogleIdToken(): Promise<string> {
  const g = load();
  if (!g) throw new Error('Login com Google indisponível nesta versão do app.');
  if (!googleConfig.webClientId) throw new Error('Login com Google não configurado (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  ensureConfigured(g);
  if (Platform.OS === 'android') await g.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await g.GoogleSignin.signIn();
  if (g.isCancelledResponse(res)) throw new GoogleSignInCancelled('Login cancelado.');
  const token = res.data.idToken;
  if (!token) throw new Error('O Google não devolveu um token de identidade. Verifique o client ID da Web.');
  return token;
}

/** Mensagem pt-BR para falhas do login Google. `null` = cancelado pelo usuário (não exibir nada). */
export function googleErrorMessage(err: unknown): string | null {
  if (err instanceof GoogleSignInCancelled) return null;
  const g = load();
  if (g && g.isErrorWithCode(err)) {
    switch (err.code) {
      case g.statusCodes.SIGN_IN_CANCELLED:
        return null;
      case g.statusCodes.IN_PROGRESS:
        return 'O login com Google já está em andamento.';
      case g.statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play Services indisponível ou desatualizado neste aparelho.';
      default:
        return 'Não foi possível entrar com o Google. Tente novamente.';
    }
  }
  // Erros do Firebase ao trocar o token (conta desativada, e-mail ligado a outro método, rede…).
  return authErrorMessage(err);
}

/** Encerra a sessão local do Google para permitir escolher outra conta depois. */
export async function googleSignOut(): Promise<void> {
  const g = load();
  if (!g || !googleConfig.webClientId) return;
  try {
    ensureConfigured(g);
    await g.GoogleSignin.signOut();
  } catch {
    // sem sessão Google local: nada a fazer
  }
}
