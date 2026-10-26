import { createContext, useContext, type ReactNode } from 'react';
import type { NoxClient } from '@nox/firebase';

const NoxContext = createContext<NoxClient | null>(null);

export function NoxProvider({ client, children }: { client: NoxClient; children: ReactNode }) {
  return <NoxContext.Provider value={client}>{children}</NoxContext.Provider>;
}

/** Cliente do NOX (Firebase + API). Só existe abaixo do NoxProvider (configuração válida). */
export function useNox(): NoxClient {
  const client = useContext(NoxContext);
  if (!client) throw new Error('useNox() fora do NoxProvider');
  return client;
}
