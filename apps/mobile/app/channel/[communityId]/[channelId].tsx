import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { subscribeChannels, subscribeCommunity } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import { can, canOnChannel, type Channel, type Community, type MessageScope } from '@nox/shared';
import { EmptyState, Loading } from '../../../src/components/Feedback';
import { Icon } from '../../../src/components/Icon';
import { Header } from '../../../src/components/Layout';
import { Txt } from '../../../src/components/Txt';
import { ChatView } from '../../../src/chat/ChatView';
import { useNox } from '../../../src/providers/NoxProvider';
import { useSession } from '../../../src/providers/SessionProvider';
import { colors, space } from '../../../src/theme';

export default function ChannelScreen() {
  const params = useLocalSearchParams<{ communityId: string; channelId: string }>();
  const communityId = String(params.communityId);
  const channelId = String(params.channelId);
  const client = useNox();
  const { memberships } = useSession();

  const community = useSubscription<Community | null>((emit, fail) => subscribeCommunity(client, communityId, emit, fail), [client, communityId]).data;
  const channels = useSubscription<Channel[]>((emit) => subscribeChannels(client, communityId, emit), [client, communityId]);
  const channel = channels.data?.find((c) => c.id === channelId);
  const role = memberships?.find((m) => m.communityId === communityId)?.role ?? null;

  const scope = useMemo<MessageScope>(() => ({ kind: 'channel', communityId, channelId }), [communityId, channelId]);

  if (channels.loading && !channels.data) return <Shell><Loading /></Shell>;
  if (!channel || channel.type !== 'text' || !canOnChannel(role, channel, 'view')) {
    return <Shell><EmptyState code="// canal indisponível" text="Este canal não existe mais ou você não tem acesso a ele." /></Shell>;
  }

  const canSend = canOnChannel(role, channel, 'send');

  return (
    <ChatView
      scope={scope}
      placeholder={`Mensagem em #${channel.name}`}
      blockedReason={canSend ? null : 'Somente leitura: você não tem permissão para enviar mensagens neste canal.'}
      canModerate={can(role, 'messages.manage')}
      header={
        <Header
          back
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] + 2 }}>
              <Icon name="hash" size={16} color={colors.textMuted} />
              <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {channel.name}
              </Txt>
            </View>
          }
          subtitle={
            <Txt variant="micro" numberOfLines={1}>
              {(community?.name ?? '…').toUpperCase()}
              {channel.topic ? ` · ${channel.topic}` : ''}
            </Txt>
          }
        />
      }
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header back title="Canal" />
      {children}
    </View>
  );
}
