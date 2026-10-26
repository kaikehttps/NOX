# Distribuição

## Desktop (Windows primeiro)

```bash
npm run dist:desktop      # apps/desktop/release/<versão>/NOX-Setup-<versão>.exe (NSIS, x64)
```

- **Versão**: `apps/desktop/package.json` → `version` (SemVer). Cada release = tag `desktop-vX.Y.Z`.
- **Assinatura de código (Windows)**: sem assinatura, o SmartScreen avisa "editor desconhecido". Para um grupo de amigos é tolerável no início; para distribuição ampla, use um certificado de assinatura (OV/EV) ou o *Azure Trusted Signing*, configurado no `electron-builder.yml` (`win.signtoolOptions` / `azureSignOptions`). Nunca versione certificados.
- **Canal confiável**: GitHub Releases de um repositório privado (ou público) é o caminho mais simples; o instalador e o `latest.yml` ficam lá.
- **Atualizações automáticas** (pendente): adicionar `electron-updater`, trocar `publish: null` por `publish: { provider: github, owner, repo, private: true }` e chamar `autoUpdater.checkForUpdatesAndNotify()` no processo principal. Atualizações só devem ser aplicadas fora de chamadas.
- **macOS/Linux**: os alvos `dmg` e `AppImage` já estão declarados. macOS exige assinatura + *notarization* (Apple Developer) e os entitlements de microfone/câmera em `build/entitlements.mac.plist`.

Checklist de release:
1. `npm run typecheck && npm test && npm run test:rules && npm run test:api`
2. `npm run e2e -w @nox/desktop` contra emuladores
3. Teste manual de voz real (docs/deployment.md → Testes de qualidade de voz)
4. `npm run dist:desktop`, instalar numa máquina limpa, abrir, logar, entrar numa sala
5. Publicar e anotar mudanças

## Mobile

Development builds (dia a dia):
```bash
cd apps/mobile
npx expo run:android         # ou run:ios (macOS + Xcode)
```

Builds de distribuição com **EAS Build** (recomendado; dispensa máquina macOS para iOS):
```bash
npm i -g eas-cli
eas login
eas build:configure          # gera eas.json (perfis development / preview / production)
eas build -p android --profile preview      # APK para testar com o grupo
eas build -p ios --profile production
eas submit -p android | ios
```

Antes das lojas:
- **Google Play**: conta de desenvolvedor, *Internal testing* primeiro; formulário de segurança de dados (Data safety) coerente com docs/privacy.md; declaração de uso de microfone; para chamadas em segundo plano no Android 14+, um *foreground service* do tipo `microphone` (pendente) e a declaração correspondente.
- **App Store**: conta Apple Developer, TestFlight; texto de uso do microfone já definido no `app.config.ts`; `UIBackgroundModes: audio` já configurado; se adotar CallKit, revisar as regras de VoIP.
- Política de privacidade e termos publicados em URL pública.
- Ícones e splash gerados por `npm run brand` (já em `apps/mobile/assets`).
