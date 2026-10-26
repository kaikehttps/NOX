const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// Módulos exclusivos de código nativo não existem no navegador: troca por equivalentes web.
const WEB_SHIMS = {
  '@livekit/react-native': path.resolve(__dirname, 'src/shims/livekit-react-native.web.ts'),
  '@livekit/react-native-webrtc': path.resolve(__dirname, 'src/shims/livekit-react-native.web.ts'),
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
