import { memo } from 'react';
import { avatarTint } from '@nox/design-system';
import type { UserProfile } from '@nox/shared';

export type PresenceState = 'online' | 'idle' | 'dnd' | 'offline';

interface Props {
  profile: Pick<UserProfile, 'uid' | 'displayName' | 'avatarUrl'> | null | undefined;
  size?: number;
  presence?: PresenceState | null;
  speaking?: boolean;
  fallbackSeed?: string;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  return (first[0]! + (last[0] ?? first[1] ?? '')).toUpperCase();
}

export const Avatar = memo(function Avatar({ profile, size = 32, presence, speaking, fallbackSeed }: Props) {
  const seed = profile?.uid ?? fallbackSeed ?? '?';
  const name = profile?.displayName ?? (profile === null ? 'conta removida' : '');
  return (
    <span className={`avatar${speaking ? ' speaking' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <span className="face" style={{ background: avatarTint(seed), fontSize: Math.max(9, size * 0.36) }}>
        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" loading="lazy" draggable={false} /> : initials(name || '·')}
      </span>
      {presence ? <span className={`status-dot ${presence}`} /> : null}
    </span>
  );
});
