import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import type { ApiConfig } from './config';
import type { RateLimiter } from './rate-limit';

export interface Deps {
  db: Firestore;
  auth: Auth;
  storage: Storage | null;
  config: ApiConfig;
  limiter: RateLimiter;
}

export interface AppEnv {
  Variables: {
    uid: string;
  };
}
