# RotaFit — Relatório de Correções: Autenticação (Google) e Spotify (OAuth 2.0 + PKCE)

| Item | Informação |
| --- | --- |
| **Projeto** | RotaFit (projeto 3 de 5), Programação para Dispositivos Móveis |
| **Professor** | Prof. Me. Bruno Assunção Dias, IESB |
| **Aluno** | Artur Martins |
| **Tecnologias** | React Native, Expo (Expo Go), Expo Router, Supabase Auth, `expo-auth-session`, `expo-web-browser` |
| **Esquema de links** | `rotafit://` (definido em `app.json`) |
| **Objetivo** | Entrar com a conta Google (sessão mantida pelo Supabase) e conectar ao Spotify para controlar a reprodução, em desenvolvimento (Expo Go) e produção (build nativa / APK) |

---

## 1. Resumo

O RotaFit tem dois logins externos, e os dois dependem de algo fora do código: a configuração dos painéis (Google Cloud, Supabase, Spotify), o esquema de links do aparelho e o comportamento do Expo Go. A regra que une as correções dos dois módulos: **a URL de retorno (`redirectUri`) precisa ser autorizada, de forma idêntica, no painel do serviço que redireciona o usuário de volta ao app.**

| # | Módulo | Problema | Solução |
| --- | --- | --- | --- |
| G1 | Google | Import `expo-auth-session/build/QueryParams` deixou de existir nas versões novas do Expo | Leitor próprio dos parâmetros da URL (`parseAuthParams`), com testes |
| G2 | Google | URLs de retorno não autorizadas (`redirect_uri_mismatch`; app não volta após o login) | Alinhar o Google Cloud, o Supabase e o esquema `rotafit://` |
| S1 | Spotify | *Unmatched Route* ao voltar do Spotify | Criar e registrar a rota `spotify-auth` |
| S2 | Spotify | Navegador congelado no botão "Aceito" (Android) | Cadastrar a conta de teste; `redirectUri` diferente em desenvolvimento e produção |
| S3 | Spotify | `Invalid authorization code` na troca do código | Recarregar o app e refazer o fluxo (*Fast Refresh* perdeu o `code_verifier`) |

---

## 2. Módulo 1 — Autenticação com Google (`src/lib/googleAuth.ts`)

### 2.1 Como funciona

O login com Google é **delegado ao Supabase**: o app nunca vê o client secret do Google.

1. `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })` devolve a URL de login do Google.
2. `WebBrowser.openAuthSessionAsync` abre essa URL em uma aba controlada e espera o retorno ao app.
3. O Google devolve o usuário ao Supabase, que o redireciona para a `redirectTo` (`rotafit://…`) com `access_token` e `refresh_token` no fragmento da URL.
4. O app lê os tokens e chama `supabase.auth.setSession(...)`.
5. **Persistência:** o cliente do Supabase usa `AsyncStorage` com `persistSession: true` e `autoRefreshToken: true`, e o `AuthContext` acompanha `onAuthStateChange`. Assim a sessão continua ativa depois de fechar e reabrir o app. Ao sair, o `queryClient` é limpo para que dados de uma conta não apareçam na outra.

```typescript
// src/lib/googleAuth.ts (essência)
export const authRedirectUri = AuthSession.makeRedirectUri({ scheme: 'rotafit' });

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUri, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUri);
  // ...cancelamento tratado...
  const { params, errorCode } = parseAuthParams(result.url);
  if (errorCode) throw new Error(params.error_description ?? errorCode);

  await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
}
```

### 2.2 Erro G1 — Import `expo-auth-session/build/QueryParams` inexistente

- **Problema:** `error TS2307: Cannot find module 'expo-auth-session/build/QueryParams'`.
- **Causa:** o guia foi escrito para uma versão anterior do Expo. No SDK 58, o `package.json` do `expo-auth-session` declara o campo `exports` e só libera o pacote principal e alguns subcaminhos (`providers/google`, `providers/facebook`, `build/PKCE`…). O arquivo `QueryParams.js` ainda existe em disco, mas o subcaminho ficou bloqueado. Sem essa função, o app não conseguiria ler os tokens devolvidos pelo Supabase.
- **Solução:** criar `src/utils/authParams.ts` com `parseAuthParams(url)`, que lê o fragmento (`#`) e a query (`?`), decodifica os valores e devolve `{ params, errorCode }`, a mesma forma que o `googleAuth.ts` já esperava. Por ser função pura, ganhou 4 testes (tokens no fragmento, query com decodificação, código de erro e URL sem parâmetros).

```typescript
// antes
import * as QueryParams from 'expo-auth-session/build/QueryParams';
const { params, errorCode } = QueryParams.getQueryParams(result.url);

// depois
import { parseAuthParams } from '@/utils/authParams';
const { params, errorCode } = parseAuthParams(result.url);
```

- **Resultado:** `tsc` sem erros e 39 testes do app passando.

### 2.3 Erro G2 — URLs de retorno não autorizadas

- **Sintomas típicos:** tela do Google com `redirect_uri_mismatch`, ou o login termina no navegador e **não volta** ao app.
- **Causa:** existem dois redirecionamentos encadeados, e cada um tem a sua lista de endereços permitidos:
  1. **Google → Supabase:** no Google Cloud Console, a *Authorized redirect URI* deve ser exatamente a URL de callback do projeto Supabase (`https://<projeto>.supabase.co/auth/v1/callback`).
  2. **Supabase → app:** no Supabase, em *Authentication → URL Configuration → Redirect URLs*, a URL de retorno do app precisa estar liberada. Em produção ela é `rotafit://…`; **em desenvolvimento no Expo Go**, o `makeRedirectUri` gera um endereço `exp://<IP>:8081/--/…` (mesmo comportamento que apareceu no Spotify, erro S2), que também precisa estar na lista.
- **Solução:** alinhar as três pontas: callback do Supabase no Google Cloud; `rotafit://` e o endereço `exp://` do Metro na lista do Supabase; esquema `"scheme": "rotafit"` no `app.json`.
- **Resultado:** o login volta ao app já autenticado, e a sessão permanece ao reabrir.

> **Nota de honestidade técnica:** os itens G2 seguem o Apêndice B do guia e a mesma lógica de redirecionamento do Spotify. Se você tiver anotado a mensagem exata que apareceu na sua execução, vale incluí-la aqui no lugar do sintoma genérico.

---

## 3. Módulo 2 — Integração com o Spotify (OAuth 2.0 + PKCE)

### Como funciona o fluxo do Spotify (contexto)

1. O app abre a página de autorização do Spotify no navegador, enviando um `code_challenge` (PKCE) e a `redirectUri`.
2. O usuário toca em "Aceito" e o Spotify redireciona para a `redirectUri` com um `code` de uso único.
3. O Expo Router recebe esse link, abre a rota correspondente, e o app troca o `code` por tokens (`exchangeCodeAsync`) enviando o `code_verifier` guardado em memória.

Qualquer falha em um desses elos gera os sintomas descritos abaixo: rota inexistente (passo 3), redirecionamento que não volta (passo 2) ou código inválido (troca do passo 3).

---

### Registro de erros, diagnósticos e soluções

### Erro S1 — "Unmatched Route" ao retornar do OAuth

- **Problema:** depois de autorizar no Spotify, o app voltava, mas o Expo Router mostrava a tela de rota não encontrada.
- **Causa:** o Spotify redireciona para `…/spotify-auth`, e o Expo Router trata esse link como uma navegação. Como não existia um arquivo de rota com esse nome, nem estava declarado no layout, nenhuma tela correspondia ao caminho.
- **Solução:**
  1. Criar o arquivo `app/(app)/spotify-auth.tsx`. Ele só precisa absorver o retorno e devolver o usuário ao app; o processamento do código acontece no `SpotifyContext`.
  2. Registrar a rota em `app/(app)/_layout.tsx`.

```tsx
// app/(app)/spotify-auth.tsx
import { Redirect } from 'expo-router';

// Tela de retorno do OAuth: o código é tratado no SpotifyContext,
// aqui apenas devolvemos o usuário ao app.
export default function SpotifyAuthCallback() {
  return <Redirect href="/" />;
}
```

```tsx
// app/(app)/_layout.tsx
<Stack.Screen name="spotify-auth" options={{ headerShown: false }} />
```

- **Resultado:** o retorno do Spotify passou a abrir uma rota válida, sem a tela de erro.

---

### Erro S2 — Navegador congelado no botão "Aceito" (redirecionamento falhava no Android)

- **Problema:** ao tocar em "Aceito" na página de login do Spotify no navegador do celular, a página travava e não voltava para o aplicativo.
- **Causa 1 (permissão da conta):** o aplicativo estava em *Development Mode* no Spotify Developer Dashboard. Nesse modo, só contas cadastradas manualmente podem autorizar, e o e-mail da conta de teste não estava na lista.
- **Causa 2 (esquema de links do Expo Go):** dentro do Expo Go, o Android não reconhece o esquema próprio `rotafit://`, que só existe em uma build nativa. O Expo Go atende pelo protocolo do servidor Metro local, `exp://`.
- **Solução:**
  1. Cadastrar o e-mail do usuário em **User Management** no Spotify Developer Dashboard.
  2. Fazer a `redirectUri` alternar entre o endereço do Expo Go (desenvolvimento) e o esquema próprio (produção).
  3. Registrar **as duas URLs** em **Redirect URIs** no painel do Spotify, porque o Spotify só aceita URIs idênticas às cadastradas:
     - `exp://192.168.0.14:8081/--/spotify-auth` (desenvolvimento, Expo Go)
     - `rotafit://spotify-auth` (produção, build nativa)
- **Resultado:** o redirecionamento passou a retornar ao app nos dois ambientes.

> **Atenção:** o IP `192.168.0.14` é o do computador na rede local naquele momento. Se a rede ou o IP mudar, a URL do Expo Go muda, e é preciso cadastrar a nova URI no painel do Spotify. Uma alternativa que evita fixar o IP no código é gerar a URL em desenvolvimento com `Linking.createURL('spotify-auth')` (pacote `expo-linking`), que devolve o mesmo formato `exp://IP:8081/--/spotify-auth` automaticamente.

---

### Erro S3 — `Invalid authorization code` durante o `exchangeCodeAsync`

- **Problema:** a troca do código pelo token falhava com a mensagem `The provided authorization grant or refresh token is invalid … [Invalid authorization code]`.
- **Causa:** no PKCE, o `code_verifier` é gerado na abertura do fluxo e fica em memória; o Spotify só aceita o código se o verificador enviado na troca for o mesmo que originou o `code_challenge`. Durante a edição do código, o *Fast Refresh* do Expo recarregou o estado do React e gerou um novo `code_verifier`. Além disso, o código de autorização só pode ser usado uma vez. O resultado foi um código válido sendo trocado com um verificador diferente do original.
- **Solução:**
  1. Fechar as abas antigas do navegador no celular, para não reutilizar um código de um fluxo anterior.
  2. Recarregar o app por completo no terminal (tecla `r`) e iniciar um novo fluxo de conexão, com `code_verifier` e `redirectUri` alinhados do início ao fim.
- **Resultado:** a troca do código pelo token foi concluída e a conexão ficou ativa.

> **Dica prática:** se o erro `Invalid authorization code` aparecer durante o desenvolvimento, quase sempre basta reiniciar o fluxo do zero (reload completo) em vez de procurar um defeito no código. Ele também surge se a `redirectUri` usada na troca for diferente da usada na abertura.

---

---

### Trechos principais do código final (Spotify)

#### S-A. `redirectUri` dinâmica (`src/context/SpotifyContext.tsx`)

```typescript
import * as AuthSession from 'expo-auth-session';

// Desenvolvimento (Expo Go): usa o endereço exp:// do servidor Metro.
// Produção (build nativa / APK): usa o esquema próprio do app.
const redirectUri = AuthSession.makeRedirectUri(
  __DEV__
    ? { native: 'exp://192.168.0.14:8081/--/spotify-auth' }
    : { scheme: 'rotafit', path: 'spotify-auth' },
);
```

#### S-B. Troca do código pelo token PKCE (`src/context/SpotifyContext.tsx`)

```typescript
useEffect(() => {
  if (response?.type !== 'success' || !request?.codeVerifier) {
    if (response?.type === 'error' || response?.type === 'cancel') setConnecting(false);
    return;
  }

  setConnecting(true);

  AuthSession.exchangeCodeAsync(
    {
      clientId: spotifyClientId,
      code: response.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    },
    spotifyDiscovery,
  )
    .then(async (result) => {
      const next: SpotifyTokens = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? '',
        expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000,
      };
      await saveTokens(next);
      setTokens(next);
    })
    .catch((err) => {
      console.error('Erro na troca de token:', err);
    })
    .finally(() => setConnecting(false));
}, [response, request]);
```

#### S-C. Declaração das rotas no layout (`app/(app)/_layout.tsx`)

```tsx
<Stack>
  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
  <Stack.Screen name="run/active" options={{ title: '', headerShown: false }} />
  <Stack.Screen name="run/[id]" options={{ title: 'Corrida' }} />
  <Stack.Screen name="spotify-auth" options={{ headerShown: false }} />
</Stack>
```

---

## 4. Checklist de configuração

**Google (via Supabase)**

- [ ] Provedor Google ativado em *Authentication → Providers → Google*, com o Client ID e o Client Secret do Google Cloud.
- [ ] No Google Cloud, a *Authorized redirect URI* é a URL de callback do Supabase.
- [ ] No Supabase, *Redirect URLs* inclui `rotafit://` (produção) e o endereço `exp://<IP>:8081/--/` (Expo Go).
- [ ] `"scheme": "rotafit"` no `app.json` e variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY` no `.env`.

**Spotify**

- [ ] App criado no Spotify Developer Dashboard e `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` no `.env`.
- [ ] E-mail de cada conta de teste em **User Management** (modo de desenvolvimento).
- [ ] Redirect URIs idênticas às do código: `exp://<IP>:8081/--/spotify-auth` e `rotafit://spotify-auth`.
- [ ] Rota `app/(app)/spotify-auth.tsx` criada e registrada no `_layout.tsx`.
- [ ] Conta **Premium** para tocar, pausar e trocar de faixa, e o app do Spotify aberto em algum dispositivo.

---

## 5. Ferramentas de IA utilizadas

- **Claude:** montagem do projeto a partir do guia, validação (tipos, testes, empacotamento) e consolidação dos relatórios.
- **Gemini:** apoio no diagnóstico dos erros durante a execução real no celular (Expo Go) e na redação do resumo dos erros que deu origem a este documento.

---

## 6. Conclusão

Nenhum dos problemas era um defeito de lógica do app: todos vieram da integração entre os painéis externos, o esquema de links de cada ambiente e o ciclo de vida do fluxo OAuth. Em resumo: (1) a URL de retorno deve ser idêntica na abertura do fluxo, na troca do código e no painel que a autoriza; (2) no Expo Go o endereço é `exp://`, na build nativa é `rotafit://`, e os dois precisam estar cadastrados; (3) o fluxo PKCE precisa terminar sem o estado do app ser recarregado no meio.
