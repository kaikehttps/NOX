import { ApiClientError, MessageValidationError, ProfileSetupError } from '@nox/firebase';
import { FirebaseError } from 'firebase/app';

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': 'Você não tem permissão para isso.',
  unavailable: 'Sem conexão. Tente novamente em instantes.',
  'deadline-exceeded': 'O servidor demorou a responder.',
  'not-found': 'Não encontrado.',
  'resource-exhausted': 'Muitas solicitações. Aguarde um pouco.',
};

/** Mensagem legível (pt-BR) para qualquer erro vindo da API, do Firebase ou da validação. */
export function errorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof ProfileSetupError || err instanceof MessageValidationError) return err.message;
  if (err instanceof FirebaseError) {
    const short = err.code.replace(/^[a-z-]+\//, '');
    return FIRESTORE_MESSAGES[short] ?? fallback;
  }
  return fallback;
}
