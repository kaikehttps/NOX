/**
 * O Firebase 13 expõe `getReactNativePersistence` apenas no build `react-native` de
 * `@firebase/auth` (dist/rn). Em tempo de execução o Metro resolve `firebase/auth` →
 * `@firebase/auth` com a condição `react-native`, mas os tipos públicos de `firebase/auth`
 * omitem a função. Esta declaração estreita espelha `dist/rn/index.rn.d.ts`.
 */
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
