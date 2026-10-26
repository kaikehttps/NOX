import { subscribeFriendRequests } from '@nox/firebase';
import { useSubscription } from '@nox/firebase/react';
import type { FriendRequest } from '@nox/shared';
import Tabs from 'expo-router/js-tabs';
import { TabBar } from '../../src/components/TabBar';
import { useNox } from '../../src/providers/NoxProvider';
import { useMe } from '../../src/providers/SessionProvider';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const client = useNox();
  const { uid } = useMe();
  // Pedidos de amizade recebidos viram um selo na aba Conversas.
  const incoming = useSubscription<FriendRequest[]>((emit) => subscribeFriendRequests(client, uid, 'incoming', emit), [client, uid]).data;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, lazy: true }}
    >
      <Tabs.Screen name="conversas" options={{ title: 'Conversas', tabBarBadge: incoming?.length ?? 0 }} />
      <Tabs.Screen name="espacos" options={{ title: 'Espaços' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
