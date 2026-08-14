# Armazena Certo Mobile

Aplicativo Expo/React Native dedicado à contagem de inventários. Android e iOS compartilham o mesmo código; a entrega imediata é um APK Android, enquanto o projeto iOS fica pronto para assinatura futura.

## Características

- Login e permissões usando a API atual.
- Catálogo local em SQLite para identificação sem internet.
- Fila transacional: toda contagem é salva antes de tentar enviar.
- Sincronização idempotente usando `client_operation_id`.
- Modos Conferir e Contínuo +1.
- Câmera nativa, lanterna, vibração e leitor físico no campo manual.
- Dados pendentes não são apagados ao sair ou expirar a sessão.

## Desenvolvimento

```powershell
Copy-Item .env.example .env
npm install
npx expo start
```

Para usar um backend local em aparelho físico, altere `EXPO_PUBLIC_API_URL` para o IP da máquina na rede, por exemplo `http://192.168.0.10:5000/api`. Em produção, mantenha HTTPS.

## APK instalável

O perfil `preview` gera APK para instalação direta:

```powershell
npm install --global eas-cli
eas login
eas init
npm run build:apk
```

O `eas init` substituirá o `projectId` provisório em `app.json`. O link do artefato pode então ser aberto diretamente no Android.

## Build local Android

Com Android SDK e Java 17 configurados:

```powershell
npx expo prebuild --platform android
cd android
.\gradlew assembleRelease
```

Antes de distribuir produção, configure e proteja um keystore de release. A pasta nativa é gerada e está ignorada no Git.

## iOS futuro

O bundle identifier já está reservado no projeto (`br.com.armazenacerto.contagem`). Quando houver Apple Developer Program:

```powershell
npm run build:ios
```

Sem assinatura Apple, os operadores de iPhone devem usar a PWA web instalada pela Tela de Início.
