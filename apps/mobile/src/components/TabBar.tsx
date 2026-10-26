import { memo } from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, hairline, space } from '../theme';
import { CallBar } from './CallBar';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

const ICONS: Record<string, IconName> = {
  conversas: 'chat',
  espacos: 'spaces',
  ajustes: 'settings',
};

/**
 * Barra de abas própria: rótulos mono, sem pílulas. A aba ativa ganha o "sinal" —
 * um traço verde no topo, o mesmo bloco do símbolo.
 */
export const TabBar = memo(function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View style={{ backgroundColor: colors.nav }}>
      <CallBar />
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: hairline,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, space[2]),
        }}
        accessibilityRole="tablist"
      >
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          const badge = typeof options?.tabBarBadge === 'number' && options.tabBarBadge > 0 ? options.tabBarBadge : null;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{ flex: 1, alignItems: 'center', paddingTop: space[3], paddingBottom: space[1], gap: space[1] + 2 }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -hairline,
                  width: 28,
                  height: 2,
                  backgroundColor: focused ? colors.accent : 'transparent',
                }}
              />
              <View>
                <Icon name={ICONS[route.name] ?? 'chat'} size={20} color={focused ? colors.text : colors.textFaint} />
                {badge ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -10,
                      minWidth: 15,
                      paddingHorizontal: 3,
                      backgroundColor: colors.accent,
                      alignItems: 'center',
                    }}
                  >
                    <Txt variant="micro" color={colors.onAccent}>
                      {badge > 99 ? '99+' : badge}
                    </Txt>
                  </View>
                ) : null}
              </View>
              <Txt variant="micro" color={focused ? colors.text : colors.textFaint}>
                {label.toUpperCase()}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});
