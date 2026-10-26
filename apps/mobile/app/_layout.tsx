import { useCallback, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfigMissing } from '../src/components/ConfigMissing';
import { ToastProvider, useToast } from '../src/components/Feedback';
import { bootClient } from '../src/lib/client';
import { NoxProvider } from '../src/providers/NoxProvider';
import { SessionProvider, useSession } from '../src/providers/SessionProvider';
import { VoiceProvider } from '../src/providers/VoiceProvider';
import { colors, fontAssets, fonts } from '../src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 180 });

const boot = bootClient();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.nav,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {boot.client ? (
            <NoxProvider client={boot.client}>
              <ToastProvider>
                <SessionProvider>
                  <VoiceRoot>
                    <AppStack fontsReady={fontsReady} />
                  </VoiceRoot>
                </SessionProvider>
              </ToastProvider>
            </NoxProvider>
          ) : fontsReady ? (
            <ConfigMissing missing={boot.missing} error={boot.error} onReady={hideSplash} />
          ) : null}
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function hideSplash() {
  SplashScreen.hide();
}

function VoiceRoot({ children }: { children: ReactNode }) {
  const toast = useToast();
  const onMicDenied = useCallback(() => toast('Microfone bloqueado. Você entrou mudo — libere o acesso nas configurações.', 'error'), [toast]);
  return <VoiceProvider onMicDenied={onMicDenied}>{children}</VoiceProvider>;
}

/** Pilha raiz com rotas protegidas pelo estado da sessão. */
function AppStack({ fontsReady }: { fontsReady: boolean }) {
  const { user, authLoading, profile } = useSession();
  const signedIn = Boolean(user);
  const hasProfile = Boolean(profile);
  // Sem tela de carregamento falsa: o splash nativo cobre até sabermos para onde ir.
  const ready = fontsReady && !authLoading && (!signedIn || profile !== undefined);

  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  if (!ready) return null;

  // Destino explícito de cada estado (a ordem interna das rotas não decide para onde ir).
  const home = !signedIn ? '/' : hasProfile ? '/conversas' : '/onboarding';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
        headerTitleStyle: { fontFamily: fonts.sansMedium },
      }}
    >
      <Stack.Protected guard={!signedIn} redirectTo={home}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasProfile} redirectTo={home}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasProfile} redirectTo={home}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="community/[id]" />
        <Stack.Screen name="channel/[communityId]/[channelId]" />
        <Stack.Screen name="voice" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack.Protected>
    </Stack>
  );
}
