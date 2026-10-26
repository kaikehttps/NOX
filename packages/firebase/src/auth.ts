import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import type { NoxClient } from './client';

export const observeAuth = (c: NoxClient, cb: (user: User | null) => void) => onAuthStateChanged(c.auth, cb);

export const signInWithEmail = (c: NoxClient, email: string, password: string) =>
  signInWithEmailAndPassword(c.auth, email.trim(), password);

export const signUpWithEmail = (c: NoxClient, email: string, password: string) =>
  createUserWithEmailAndPassword(c.auth, email.trim(), password);

export const resetPassword = (c: NoxClient, email: string) => sendPasswordResetEmail(c.auth, email.trim());

/**
 * Login Google a partir de um ID token obtido pelo fluxo oficial de cada plataforma
 * (OAuth loopback + PKCE no desktop, Google Sign-In nativo no mobile).
 * O NOX nunca recebe a senha do Google.
 */
export const signInWithGoogleIdToken = (c: NoxClient, idToken: string, accessToken?: string) =>
  signInWithCredential(c.auth, GoogleAuthProvider.credential(idToken, accessToken));

export const signOut = (c: NoxClient) => fbSignOut(c.auth);

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Informe a senha.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/email-already-in-use': 'Este e-mail já tem uma conta. Tente entrar.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Sem conexão. Verifique sua rede.',
  'auth/account-exists-with-different-credential': 'Este e-mail já está ligado a outro método de login.',
  'auth/requires-recent-login': 'Por segurança, entre novamente antes de continuar.',
  'auth/popup-closed-by-user': 'Login cancelado.',
  'auth/configuration-not-found': 'O login ainda não foi ativado neste projeto do Firebase (Authentication → Começar).',
  'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase Authentication.',
};

export function authErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) return AUTH_MESSAGES[err.code] ?? 'Não foi possível autenticar. Tente novamente.';
  if (err instanceof Error && err.message) return err.message;
  return 'Não foi possível autenticar. Tente novamente.';
}
