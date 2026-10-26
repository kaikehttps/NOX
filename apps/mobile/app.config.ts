import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração nativa do NOX mobile.
 * Valores sensíveis ao ambiente vêm de variáveis `EXPO_PUBLIC_*` / `NOX_*` (ver .env.example).
 * Fundo quase preto em todos os pontos (raiz, splash, ícone adaptativo) para nunca piscar branco.
 */
const BG = '#050608';

const bundleId = process.env.NOX_IOS_BUNDLE_ID || 'app.nox.mobile';
const androidPackage = process.env.NOX_ANDROID_PACKAGE || 'app.nox.mobile';
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();

const MIC_TEXT = 'O NOX usa o microfone para você falar nos canais de voz e chamadas com seu grupo.';
const CAMERA_TEXT = 'O NOX usa a câmera apenas quando você decide ativá-la em uma chamada.';

type PluginEntry = string | [string, Record<string, unknown>];

const plugins: PluginEntry[] = [
  'expo-router',
  'expo-font',
  [
    'expo-splash-screen',
    {
      backgroundColor: BG,
      image: './assets/splash-icon.png',
      imageWidth: 112,
      resizeMode: 'contain',
      // Sem variante "dark": o splash já é escuro e um dark-mode separado conflita com userInterfaceStyle no iOS.
  // Voz/WebRTC usam módulos nativos: sem build web.
  platforms: ['android', 'ios'],
    },
  ],
  [
    'expo-build-properties',
    {
      android: { minSdkVersion: 24 },
    },
  ],
  '@livekit/react-native-expo-plugin',
  ['@config-plugins/react-native-webrtc', { microphonePermission: MIC_TEXT, cameraPermission: CAMERA_TEXT }],
];

// Sem o URL scheme do iOS, o plugin do Google exigiria GoogleService-Info.plist; omitimos
// o plugin até a variável existir (o login Google no Android funciona apenas com o webClientId).
if (googleIosUrlScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'NOX',
  slug: 'nox',
  scheme: 'nox',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: BG,
  primaryColor: BG,
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    backgroundColor: BG,
    userInterfaceStyle: 'dark',
    infoPlist: {
      NSMicrophoneUsageDescription: MIC_TEXT,
      NSCameraUsageDescription: CAMERA_TEXT,
      UIBackgroundModes: ['audio'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: androidPackage,
    backgroundColor: BG,
    userInterfaceStyle: 'dark',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BG,
    },
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
    ],
    // Padrões do template que o NOX não usa.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins,
  experiments: {
    typedRoutes: false,
  },
  extra: {
    router: {},
  },
});
