import { useEffect, useMemo } from 'react';
import { ChevronDown, Hash, Link2, LogOut, Plus, Settings2, Trash2, Volume2 } from 'lucide-react';
import {
  BRAND,
  ROLE_LABEL,
  ROLES,
  can,
  canAssignRole,
  canOnChannel,
  canRemoveMember,
  type Category,
  type Channel,
  type Community,
  type CommunityMember,
  type CommunityRole,
  type UserProfile,
  type VoiceState,
} from '@nox/shared';
import { subscribeCategories, subscribeChannels, subscribeCommunity, subscribeMembers, subscribeVoiceStates } from '@nox/firebase';
import { usePresences, useProfiles, useSubscription } from '@nox/firebase/react';
import { Avatar } from '../components/Avatar';
import { Empty, Modal, SignalLoader } from '../components/Overlay';
import { errorText, useNav, useSession, useUi, useVoice, type MenuEntry } from '../lib/context';
import { client } from '../lib/nox';
import { ChannelModal } from '../modals/ChannelModal';
import { InviteModal } from '../modals/InviteModal';
import { CommunitySettingsModal } from '../modals/CommunitySettingsModal';
import { Chat } from './Chat';
import { MePanel } from './MePanel';
import { LevelBars, VoiceDock, VoiceStage } from './Voice';

function groupChannels(channels: Channel[], categories: Category[]) {
  const byCat = new Map<string | null, Channel[]>();
  for (const ch of channels) {
    const key = ch.categoryId && categories.some((c) => c.id === ch.categoryId) ? ch.categoryId : null;
    byCat.set(key, [...(byCat.get(key) ?? []), ch]);
  }
  const groups: { category: Category | null; channels: Channel[] }[] = [];
  if (byCat.get(null)?.length) groups.push({ category: null, channels: byCat.get(null)! });
  for (const cat of categories) groups.push({ category: cat, channels: byCat.get(cat.id) ?? [] });
  return groups;
}

export function CommunityView({ communityId, channelId }: { communityId: string; channelId: string | null }) {
  const c = client();
  const { uid } = useSession();
  const { go } = useNav();
  const ui = useUi();
  const v = useVoice();

  // Listeners da comunidade vivem apenas enquanto esta tela está aberta.
  const community = useSubscription<Community | null>((emit, fail) => subscribeCommunity(c, communityId, emit, fail), [communityId]);
  const channels = useSubscription<Channel[]>((emit) => subscribeChannels(c, communityId, emit), [communityId]);
  const categories = useSubscription<Category[]>((emit) => subscribeCategories(c, communityId, emit), [communityId]);
  const members = useSubscription<CommunityMember[]>((emit) => subscribeMembers(c, communityId, emit), [communityId]);
  const voiceStates = useSubscription<VoiceState[]>((emit) => subscribeVoiceStates(c, { communityId }, emit), [communityId]);

  const role: CommunityRole | null = members.data?.find((m) => m.uid === uid)?.role ?? null;
  const memberIds = useMemo(() => (members.data ?? []).map((m) => m.uid), [members.data]);
  const profiles = useProfiles(c, memberIds);
  const presence = usePresences(c, memberIds);

  const visibleChannels = (channels.data ?? []).filter((ch) => canOnChannel(role, ch, 'view'));
  const active = visibleChannels.find((ch) => ch.id === channelId) ?? visibleChannels.find((ch) => ch.type === 'text') ?? null;

  // Abre o primeiro canal de texto ao entrar na comunidade.
  useEffect(() => {
    if (active && active.id !== channelId) go({ kind: 'community', communityId, channelId: active.id });
  }, [active, channelId, communityId, go]);

  if (community.error || community.data === null) {
    return (
      <>
        <aside className="sidebar">
          <div className="panel-head" />
          <div />
          <VoiceDock />
          <MePanel />
        </aside>
        <main className="main">
          <div className="main-head" />
          <Empty glyph="// sem acesso" action={<button className="btn" onClick={() => go({ kind: 'home', tab: 'online' })}>Voltar ao início</button>}>
            Esta comunidade não existe mais ou você não participa dela.
          </Empty>
        </main>
      </>
    );
  }

  const name = community.data?.name ?? '…';
  const manage = can(role, 'channels.manage');

  const openCommunityMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const entries: MenuEntry[] = [];
    if (can(role, 'invites.create')) entries.push({ label: 'Convidar pessoas', icon: <Link2 size={14} />, onSelect: () => ui.openModal((close) => <InviteModal communityId={communityId} communityName={name} onClose={close} />) });
    if (manage) {
      entries.push({ label: 'Criar canal', icon: <Plus size={14} />, onSelect: () => ui.openModal((close) => <ChannelModal communityId={communityId} categories={categories.data ?? []} onClose={close} />) });
      entries.push({
        label: 'Criar categoria',
        icon: <Plus size={14} />,
        onSelect: () => ui.openModal((close) => <ChannelModal communityId={communityId} categories={categories.data ?? []} onClose={close} categoryMode />),
      });
    }
    if (can(role, 'community.edit') && community.data) {
      entries.push({ label: 'Configurações do espaço', icon: <Settings2 size={14} />, onSelect: () => ui.openModal((close) => <CommunitySettingsModal community={community.data!} role={role!} onClose={close} />) });
    }
    if (role !== 'owner') {
      entries.push('separator', {
        label: 'Sair da comunidade',
        icon: <LogOut size={14} />,
        danger: true,
        onSelect: () =>
          ui.openModal((close) => (
            <Modal
              label="sair da comunidade"
              onClose={close}
              footer={
                <>
                  <button className="btn ghost" onClick={close}>Cancelar</button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      close();
                      c.api
                        .leaveCommunity(communityId)
                        .then(() => go({ kind: 'home', tab: 'online' }))
                        .catch((err) => ui.toast(errorText(err), 'error'));
                    }}
                  >
                    Sair
                  </button>
                </>
              }
            >
              <div className="modal-body">
                <p style={{ margin: 0 }}>Sair de <b>{name}</b>? Você vai precisar de um novo convite para voltar.</p>
              </div>
            </Modal>
          )),
      });
    }
    if (entries.length) ui.openMenu({ x: r.left + 8, y: r.bottom + 4 }, entries);
  };

  const channelMenu = (e: React.MouseEvent, ch: Channel) => {
    e.preventDefault();
    const entries: MenuEntry[] = [{ label: 'Copiar ID do canal', onSelect: () => void navigator.clipboard.writeText(ch.id) }];
    if (manage) {
      entries.push(
        { label: 'Editar canal', onSelect: () => ui.openModal((close) => <ChannelModal communityId={communityId} categories={categories.data ?? []} channel={ch} onClose={close} />) },
        { label: 'Mover para cima', onSelect: () => move(ch, -1) },
        { label: 'Mover para baixo', onSelect: () => move(ch, 1) },
        'separator',
        {
          label: 'Apagar canal',
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () =>
            ui.openModal((close) => (
              <Modal
                label="apagar canal"
                onClose={close}
                footer={
                  <>
                    <button className="btn ghost" onClick={close}>Cancelar</button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        close();
                        c.api.deleteChannel(communityId, ch.id).catch((err) => ui.toast(errorText(err), 'error'));
                      }}
                    >
                      Apagar
                    </button>
                  </>
                }
              >
                <div className="modal-body">
                  <p style={{ margin: 0 }}>Apagar <b>#{ch.name}</b> e todo o histórico? Isto não pode ser desfeito.</p>
                </div>
              </Modal>
            )),
        },
      );
    }
    ui.openMenu({ x: e.clientX, y: e.clientY }, entries);
  };

  const move = (ch: Channel, dir: -1 | 1) => {
    const ordered = [...(channels.data ?? [])].sort((a, b) => a.position - b.position);
    const i = ordered.findIndex((x) => x.id === ch.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
    c.api
      .reorder(
        communityId,
        'channels',
        ordered.map((x) => x.id),
      )
      .catch((err) => ui.toast(errorText(err), 'error'));
  };

  const groups = groupChannels(visibleChannels, categories.data ?? []);
  const occupantsOf = (chId: string) => (voiceStates.data ?? []).filter((s) => s.channelId === chId);

  return (
    <>
      <aside className="sidebar">
        <button className="panel-head" style={{ width: '100%', textAlign: 'left' }} onClick={openCommunityMenu}>
          <span className="title truncate">{name}</span>
          <span className="path" style={{ marginLeft: 'auto' }}>
            {role ? ROLE_LABEL[role] : ''}
          </span>
          <ChevronDown size={14} className="faint" />
        </button>
        <div className="sidebar-scroll">
          {channels.loading ? (
            <div className="empty">
              <SignalLoader />
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.category?.id ?? 'none'}>
                {g.category && (
                  <div className="section-label">
                    <span className="label">{g.category.name}</span>
                    {manage && (
                      <button
                        title="Criar canal"
                        aria-label={`Criar canal em ${g.category.name}`}
                        onClick={() => ui.openModal((close) => <ChannelModal communityId={communityId} categories={categories.data ?? []} defaultCategoryId={g.category!.id} onClose={close} />)}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                )}
                {g.channels.map((ch) => {
                  const occupants = ch.type === 'voice' ? occupantsOf(ch.id) : [];
                  const connectedHere = v.ref?.kind === 'channel' && v.ref.channelId === ch.id && (v.state === 'connected' || v.state === 'reconnecting');
                  return (
                    <div key={ch.id}>
                      <button
                        className={`nav-item${active?.id === ch.id ? ' active' : ''}`}
                        onClick={() => go({ kind: 'community', communityId, channelId: ch.id })}
                        onContextMenu={(e) => channelMenu(e, ch)}
                      >
                        <span className="glyph">{ch.type === 'text' ? <Hash size={14} /> : <Volume2 size={14} />}</span>
                        <span className="truncate">{ch.name}</span>
                        {(occupants.length > 0 || connectedHere) && (
                          <span className="meta">
                            <span className={`chip${connectedHere ? ' live' : ''}`}>{occupants.length}</span>
                          </span>
                        )}
                      </button>
                      {occupants.length > 0 && (
                        <div className="voice-occupants">
                          {occupants.map((o) => {
                            const live = connectedHere ? v.participants.find((p) => p.identity === o.uid) : undefined;
                            return (
                              <div key={o.uid} className={`voice-occupant${live?.isSpeaking ? ' speaking' : ''}`}>
                                <Avatar profile={profiles[o.uid]} size={18} speaking={live?.isSpeaking} fallbackSeed={o.uid} />
                                <span className="truncate">{profiles[o.uid]?.displayName ?? '…'}</span>
                                {live?.micEnabled && <LevelBars identity={o.uid} bars={3} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <VoiceDock />
        <MePanel />
      </aside>

      <main className="main">
        <div className="main-head">
          {active ? (
            <>
              <span className="glyph">{active.type === 'text' ? <Hash size={16} /> : <Volume2 size={16} />}</span>
              <span className="name">{active.name}</span>
              {active.topic && <span className="topic truncate">{active.topic}</span>}
              {active.access.send !== 'member' && active.type === 'text' && <span className="chip">somente {ROLE_LABEL[active.access.send]}+</span>}
            </>
          ) : (
            <span className="name">{name}</span>
          )}
        </div>
        {!active ? (
          <Empty glyph="// sem canais">
            {manage ? 'Crie o primeiro canal pelo menu do espaço.' : 'Nenhum canal visível para você ainda.'}
          </Empty>
        ) : active.type === 'voice' ? (
          <VoiceStage
            roomRef={{ kind: 'channel', communityId, channelId: active.id }}
            title={active.name}
            occupants={occupantsOf(active.id)}
            canConnect={canOnChannel(role, active, 'connect')}
          />
        ) : (
          <Chat
            key={active.id}
            scope={{ kind: 'channel', communityId, channelId: active.id }}
            target={`#${active.name}`}
            canModerate={can(role, 'messages.manage')}
            mentionables={memberIds.map((u) => profiles[u]).filter((p): p is UserProfile => Boolean(p) && p!.uid !== uid)}
            lockedReason={canOnChannel(role, active, 'send') ? null : `Somente ${ROLE_LABEL[active.access.send]} ou acima podem enviar mensagens aqui.`}
            intro={
              <div className="chat-intro">
                <div className="prompt">
                  ❯ {name.toLowerCase()} / #{active.name}
                </div>
                <h1>#{active.name}</h1>
                <p className="muted" style={{ margin: 0 }}>
                  {active.topic || BRAND.empty.channel}
                </p>
              </div>
            }
          />
        )}
      </main>

      <MembersPanel
        communityId={communityId}
        members={members.data ?? []}
        myRole={role}
        profiles={profiles}
        presence={presence}
      />
    </>
  );
}

function MembersPanel(props: {
  communityId: string;
  members: CommunityMember[];
  myRole: CommunityRole | null;
  profiles: Record<string, UserProfile | null | undefined>;
  presence: Record<string, { state: 'online' | 'idle' | 'dnd' | 'offline' } | undefined>;
}) {
  const { uid } = useSession();
  const ui = useUi();
  const c = client();

  const memberMenu = (e: React.MouseEvent, m: CommunityMember) => {
    e.preventDefault();
    const p = props.profiles[m.uid];
    const entries: MenuEntry[] = [{ label: 'Copiar nome de usuário', onSelect: () => void navigator.clipboard.writeText(`@${p?.username ?? ''}`) }];
    const me = props.myRole;
    if (me && m.uid !== uid) {
      const assignable = ROLES.filter((r) => r !== m.role && canAssignRole(me, m.role, r));
      if (assignable.length) {
        entries.push('separator');
        for (const r of assignable) {
          entries.push({
            label: `Tornar ${ROLE_LABEL[r]}`,
            onSelect: () => c.api.setMemberRole(props.communityId, m.uid, r).catch((err) => ui.toast(errorText(err), 'error')),
          });
        }
      }
      if (canRemoveMember(me, m.role)) {
        entries.push('separator', {
          label: 'Remover da comunidade',
          danger: true,
          onSelect: () => c.api.removeMember(props.communityId, m.uid).catch((err) => ui.toast(errorText(err), 'error')),
        });
      }
    }
    ui.openMenu({ x: e.clientX, y: e.clientY }, entries);
  };

  const byRole = ROLES.map((r) => ({
    role: r,
    list: props.members
      .filter((m) => m.role === r)
      .sort((a, b) => (props.profiles[a.uid]?.displayName ?? '').localeCompare(props.profiles[b.uid]?.displayName ?? '')),
  })).filter((g) => g.list.length > 0);

  return (
    <aside className="side-panel" aria-label="Membros">
      {byRole.map((g) => (
        <div key={g.role}>
          <div className="section-label">
            <span className="label">
              {ROLE_LABEL[g.role]} — {g.list.length}
            </span>
          </div>
          {g.list.map((m) => {
            const st = props.presence[m.uid]?.state ?? 'offline';
            const p = props.profiles[m.uid];
            return (
              <button key={m.uid} className={`member-row${st === 'offline' ? ' offline' : ''}`} onContextMenu={(e) => memberMenu(e, m)} onClick={(e) => memberMenu(e, m)}>
                <Avatar profile={p} size={28} presence={st} fallbackSeed={m.uid} />
                <span className="truncate">{p?.displayName ?? '…'}</span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
