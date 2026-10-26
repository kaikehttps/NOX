// Na web o livekit-client usa o WebRTC do próprio navegador: sem registerGlobals nem sessão de áudio nativa.
export const registerGlobals = () => undefined;
export const AudioSession = {
  startAudioSession: async () => undefined,
  stopAudioSession: async () => undefined,
};
