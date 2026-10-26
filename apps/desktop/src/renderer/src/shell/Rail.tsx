import { memo, useEffect, useState } from 'react';
import { deleteDoc, doc, getDocFromServer } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import type { Community } from '@nox/shared';
import { subscribeCommunity } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import { NoxSymbol } from '../components/Logo';
import { initials } from '../components/Avatar';
import { lastChannelFor, useNav, useSession, useUi } from '../lib/context';
import { useData } from '../lib/data';
import { client } from '../lib/nox';
import { CommunityModal } from '../modals/CommunityModal';

const RailCommunity = memo(function RailCommunity({ communityId, active }: { communityId: string; active: boolean }) {
  const { go } = useNav();
  const { uid } = useSession();
  const community = useSubscription<Community | null>(
    (emit, fail) => subscribeCommunity(client(), communityId, emit, fail),
    [communityId],
  );
  const name = community.data?.name ?? '';

  // Comunidade apagada ou acesso removido: depois de confirmar com uma nova leitura
  // (evita corrida logo após criar/entrar), limpa o próprio índice para o ícone sumir.
  const [gone, setGone] = useState(false);
  const suspicious = community.data === null || community.error !== null;
  useEffect(() => {
    if (!suspicious) return;
    const t = setTimeout(async () => {
      const ref = doc(client().db, 'communities', communityId);
      const stillGone = await getDocFromServer(ref)
        .then((s) => !s.exists())
        .catch((err: { code?: string }) => err.code === 'permission-denied');
      if (!stillGone) return;
      setGone(true);
      await deleteDoc(doc(client().db, 'users', uid, 'memberships', communityId)).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, [suspicious, uid, communityId]);
  if (gone) return null;
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
