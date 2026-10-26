import { memo } from 'react';
import { Plus } from 'lucide-react';
import type { Community } from '@nox/shared';
import { subscribeCommunity } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import { NoxSymbol } from '../components/Logo';
import { initials } from '../components/Avatar';
import { lastChannelFor, useNav, useUi } from '../lib/context';
import { useData } from '../lib/data';
import { client } from '../lib/nox';
import { CommunityModal } from '../modals/CommunityModal';

const RailCommunity = memo(function RailCommunity({ communityId, active }: { communityId: string; active: boolean }) {
  const { go } = useNav();
  const community = useSubscription<Community | null>((emit) => subscribeCommunity(client(), communityId, emit), [communityId]);
  const name = community.data?.name ?? '';
  return (
    <div className={`rail-slot${active ? ' active' : ''}`}>
      <button
        className={`rail-item${active ? ' active' : ''}`}
        title={name}
        aria-label={name || 'comunidade'}
        onClick={() => go({ kind: 'community', communityId, channelId: lastChannelFor(communityId) })}
      >
        {community.data?.iconUrl ? <img src={community.data.iconUrl} alt="" /> : initials(name || '··')}
      </button>
    </div>
  );
});

export function Rail() {
  const { view, go } = useNav();
  const ui = useUi();
  const { memberships, unreadCount } = useData();
  const homeActive = view.kind !== 'community';
  const sorted = [...memberships].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));

  return (
    <nav className="rail" aria-label="Comunidades">
      <div className={`rail-slot${homeActive ? ' active' : unreadCount > 0 ? ' unread' : ''}`}>
        <button className="rail-home" title="Início" aria-label="Início" onClick={() => go({ kind: 'home', tab: 'online' })}>
          <NoxSymbol color={homeActive ? 'var(--nox-accent)' : 'var(--nox-text-muted)'} />
        </button>
      </div>
      <div className="rail-sep" />
      {sorted.map((m) => (
        <RailCommunity key={m.communityId} communityId={m.communityId} active={view.kind === 'community' && view.communityId === m.communityId} />
      ))}
      <div className="rail-slot">
        <button
          className="rail-item rail-add"
          title="Criar ou entrar em uma comunidade"
          aria-label="Criar ou entrar em uma comunidade"
          onClick={() => ui.openModal((close) => <CommunityModal onClose={close} />)}
        >
          <Plus size={18} />
        </button>
      </div>
    </nav>
  );
}
