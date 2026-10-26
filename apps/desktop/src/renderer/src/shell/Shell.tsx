import { useEffect } from 'react';
import { inviteCodeSchema } from '@nox/validation';
import { subscribeCommunity } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import type { Community } from '@nox/shared';
import { useNav, useSession, useUi } from '../lib/context';
import { useData } from '../lib/data';
import { client, voice } from '../lib/nox';
import { Rail } from './Rail';
import { HomeSidebar } from './HomeSidebar';
import { HomeView } from './HomeView';
import { ConversationView } from './ConversationView';
import { CommunityView } from './CommunityView';
import { CommunityModal } from '../modals/CommunityModal';
import { useVoiceShortcuts } from './Voice';

function TitlePath() {
  const { view } = useNav();
  const { profile } = useSession();
  const community = useSubscription<Community | null>(
    view.kind === 'community' ? (emit) => subscribeCommunity(client(), view.communityId, emit) : null,
    [view.kind === 'community' ? view.communityId : null],
  );
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '-');
  let path = '~';
  if (view.kind === 'home') path = '~/amigos';
  if (view.kind === 'conversation') path = '~/mensagens';
  if (view.kind === 'community') path = `~/${community.data ? slug(community.data.name) : '…'}`;
  return (
    <span className="path truncate">
      <b>{profile.username}</b>@nox <span className="accent">{path}</span>
    </span>
  );
}

export function Shell() {
  const { view } = useNav();
  const ui = useUi();
  const { conversations } = useData();
  useVoiceShortcuts();

  // Convites recebidos por link nox://invite/<código>
  useEffect(() => {
    return window.nox?.onDeepLink((url) => {
      const match = /^nox:\/\/invite\/([^/?#]+)/i.exec(url);
      const parsed = match ? inviteCodeSchema.safeParse(match[1]) : null;
      if (parsed?.success) ui.openModal((close) => <CommunityModal initialCode={parsed.data} onClose={close} />);
    });
  }, [ui]);

  // Libera recursos de mídia ao fechar a janela de vez.
  useEffect(() => {
    const onUnload = () => void voice.leave();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const activeConversation = view.kind === 'conversation' ? conversations.find((cv) => cv.id === view.conversationId) : undefined;

  return (
    <div className="app">
      <div className="titlebar">
        <TitlePath />
        <span className="spacer" />
      </div>
      <div className="shell">
        <Rail />
        {view.kind === 'community' ? (
          <CommunityView key={view.communityId} communityId={view.communityId} channelId={view.channelId} />
        ) : (
          <>
            <HomeSidebar />
            {view.kind === 'home' ? <HomeView tab={view.tab} /> : <ConversationView key={view.conversationId} conversationId={view.conversationId} conversation={activeConversation} />}
          </>
        )}
      </div>
    </div>
  );
}
